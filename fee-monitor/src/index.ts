import * as fs from "fs";
import * as _ from "lodash";
import { email, sdk, slack, SERVER } from "./config";
import { getStakeholders } from "./Stake";
import { getCCCBalances } from "./CCC";
import { Watchdog } from "watchdog";
import { DynamicChecker } from "./DynamicChecker";
import { checkBlockStatic } from "./StaticChecker";
import { getCommonParams, getMinimumFees } from "./CommonParams";

async function getTermMetadata(blockNumber: number): Promise<[number, number] | null> {
    const result = await sdk.rpc.sendRpcRequest("chain_getTermMetadata", [blockNumber]);

    if (result === null) {
        return null;
    }
    if (Array.isArray(result) && result.length === 2 && result.every(x => typeof x === "number")) {
        return result as [number, number];
    } else {
        throw Error(
            `Expected getTermMetadata to return [number, number] | null but it returned ${result}`,
        );
    }
}

async function checkBlock(blockNumber: number, dynamicChecker: DynamicChecker) {
    const commonParams = await getCommonParams(blockNumber - 1);
    const [lastTermFinished] = (await getTermMetadata(blockNumber - 1))!;
    const termSeconds = commonParams.termSeconds;
    const minimumFees = getMinimumFees(commonParams);
    if (termSeconds == null || lastTermFinished === 0) {
        await checkBlockStatic(blockNumber, minimumFees, dynamicChecker.nominationDeposits);
    } else {
        await dynamicChecker.checkBlockDynamic(blockNumber, {
            termSeconds,
            minimumFees,
        });
    }
}

async function getNextBlockNumber(current: number) {
    for (;;) {
        const bestBlockNumber = await sdk.rpc.chain.getBestBlockNumber()!;
        if (current >= bestBlockNumber) {
            // wait for 1 sec
            await new Promise(resolve => setTimeout(resolve, 1000));
        } else if (bestBlockNumber > current) {
            return current + 1;
        }
    }
}

async function getCurrentTermStartBlockNumber(blockNumber: number): Promise<number | null> {
    const metaData = await getTermMetadata(blockNumber);
    if (metaData === null) {
        return null;
    }
    const [lastTermFinished] = metaData;
    return lastTermFinished + 1;
}

async function startFrom() {
    if (process.env.BLOCK_NUMBER) {
        let blockNumber = parseInt(process.env.BLOCK_NUMBER, 10);
        if (isNaN(blockNumber) || blockNumber === 0) {
            throw new Error("BLOCK_NUMBER must be a non-zero positive integer");
        }
        const currentTermStart = await getCurrentTermStartBlockNumber(blockNumber);
        if (currentTermStart === null) {
            throw new Error(
                `BLOCK_NUMBER(${blockNumber}) is bigger than current best block number`,
            );
        } else if (currentTermStart === 1) {
            return blockNumber;
        } else {
            return currentTermStart;
        }
    }

    let bestBlockNumber = await await sdk.rpc.chain.getBestBlockNumber()!;
    if (process.env.LOOK_BEHIND) {
        let lookBehind = parseInt(process.env.LOOK_BEHIND, 10);
        if (isNaN(lookBehind) || lookBehind < 0) {
            throw new Error("LOOK_BEHIND must be an integer");
        }
        const want = bestBlockNumber - lookBehind;
        const wantingTermStart = (await getCurrentTermStartBlockNumber(want))!;
        if (wantingTermStart === null) {
            throw new Error(`BLOCK_NUMBER(${want}) is bigger than current best block number`);
        } else if (wantingTermStart === 1) {
            return want;
        } else {
            return wantingTermStart;
        }
    }

    if (fs.existsSync(`lastBlockNumber.${SERVER}`)) {
        const content = fs.readFileSync(`lastBlockNumber.${SERVER}`, "utf8");
        if (content == null) {
            throw new Error("Cannot read lastBlockNumber file in some reason");
        }
        const blockNumber = parseInt(content);
        if (isNaN(blockNumber)) {
            throw new Error("lastBlockNumber file contains invalid number");
        }
        const currentTermStart = (await getCurrentTermStartBlockNumber(blockNumber))!;

        if (currentTermStart === null) {
            throw new Error(
                `BLOCK_NUMBER(${blockNumber}) is bigger than current best block number`,
            );
        } else if (currentTermStart === 1) {
            return blockNumber;
        } else {
            return currentTermStart;
        }
    }

    const defaultBlockNumber = bestBlockNumber - 100;
    const defaultTermStart = (await getCurrentTermStartBlockNumber(defaultBlockNumber))!;
    if (defaultTermStart === 1) {
        return defaultBlockNumber;
    } else {
        return defaultTermStart;
    }
}

interface Progress {
    blockNumber: number;
    retry: number;
}

function createWatchdog(timeout: number): Watchdog<Progress> {
    let stalled = false;
    const dog = new Watchdog<Progress>(timeout * 1000);
    dog.on("reset", ({ data }, _dummy) => {
        stalled = true;
        const message =
            `fee-monitor has been stalled for ${timeout} seconds:` +
            JSON.stringify(data, null, "    ");
        console.warn(message);
        slack.sendError(message);
        email.sendError(message);
    });
    dog.on("feed", ({ data }, _dummy) => {
        if (stalled) {
            stalled = false;
            const message = JSON.stringify(data, null, "    ");
            console.warn(message);
            const title = "has been recovered to normal.";
            slack.sendInfo(title, message);
        }
    });
    return dog;
}

let setIntervalId: any = null;

async function main() {
    let blockNumber = await startFrom();

    let lastReportedBlockNumber = blockNumber;
    let lastReportedDate = new Date().getUTCDate();
    let dynamicChecker = new DynamicChecker();
    setIntervalId = setInterval(() => {
        (async () => {
            const now = new Date();
            if (now.getUTCDate() === lastReportedDate) {
                return;
            }
            const currentBlockNumber = blockNumber;
            const stakeholders = [];
            for (const [address, balance] of await getCCCBalances(
                await getStakeholders(blockNumber),
                blockNumber,
            )) {
                stakeholders.push(`${address}: ${balance.toString(10)}`);
            }
            const reports = [];
            reports.push(
                `Block between ${lastReportedBlockNumber} ~ ${currentBlockNumber} are checked`,
            );
            reports.push(`Stakeholders`);
            reports.push(`${stakeholders.join("\n")}`);

            slack.sendInfo("is working.", `${reports.join("\n")}`);
            lastReportedDate = now.getUTCDate();
            lastReportedBlockNumber = currentBlockNumber;
        })().catch(console.error);
    }, 60_000); // 1 minute interval

    const dog = createWatchdog(30);
    for (;;) {
        console.log();
        console.log(`BlockNumber: ${blockNumber}`);
        for (let retry = 1; ; retry++) {
            // checkpoint
            // lodash cloneDeep is not able to preserve the original prototype of the class.
            // If you are checking prototype with operators like "instanceof" then find
            // another way. https://stackoverflow.com/a/34295179/2756490
            const clonedChecker = _.cloneDeep(dynamicChecker);
            try {
                dog.feed({
                    data: { blockNumber, retry },
                });
                await checkBlock(blockNumber, dynamicChecker);
                blockNumber = await getNextBlockNumber(blockNumber);
                break;
            } catch (e) {
                if (retry === 10) {
                    console.error(`Too many retries: ${retry}`);
                    throw e;
                }
                console.error(`Retry ${e}. wait for ${retry} sec(s)`);
                // revert
                dynamicChecker = clonedChecker;
                await new Promise(resolve => setTimeout(resolve, 1000 * retry));
            }
        }
        fs.writeFileSync(`lastBlockNumber.${SERVER}`, blockNumber.toString(10), "utf8");
    }
}

main().catch(error => {
    console.log({ error });
    try {
        slack.sendError(error);
    } catch (slackSendError) {
        console.error(`Fail to send a slack message for the erorr ${error}`);
        console.error(slackSendError);
    }
    try {
        email.sendError(error.message);
    } catch (sendEmailError) {
        console.error("Fail to send an email for the error ${err}");
        console.error(sendEmailError);
    }

    if (setIntervalId != null) {
        clearInterval(setIntervalId);
    }

    setTimeout(() => {
        // Wait for 10 seconds to make sure email and slack message is sent.
        // If we didn't wait, fee-monitor will be killed before send error messages.
        process.exit(1);
    }, 10_000);
});
