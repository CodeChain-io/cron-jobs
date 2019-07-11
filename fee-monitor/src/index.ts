import * as fs from "fs";
import { email, sdk, slack, SERVER } from "./config";
import { getStakeholders } from "./Stake";
import { getCCCBalances } from "./CCC";
import { Watchdog } from "watchdog";
import { DynamicChecker } from "./DynamicChecker";
import { checkBlockStatic } from "./StaticChecker";
import { getCommonParams, getMinimumFees } from "./CommonParams";

async function checkBlock(blockNumber: number, dynamicChecker: DynamicChecker) {
    const commonParams = await getCommonParams(blockNumber - 1);
    const termSeconds = commonParams.termSeconds;
    const minimumFees = getMinimumFees(commonParams);
    if (termSeconds == null) {
        await checkBlockStatic(blockNumber, minimumFees);
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

async function startFrom() {
    if (process.env.BLOCK_NUMBER) {
        let blockNumber = parseInt(process.env.BLOCK_NUMBER, 10);
        if (isNaN(blockNumber) || blockNumber === 0) {
            throw new Error("BLOCK_NUMBER must be a non-zero positive integer");
        }
        return blockNumber;
    }

    let bestBlockNumber = await await sdk.rpc.chain.getBestBlockNumber()!;
    if (process.env.LOOK_BEHIND) {
        let lookBehind = parseInt(process.env.LOOK_BEHIND, 10);
        if (isNaN(lookBehind) || lookBehind < 0) {
            throw new Error("LOOK_BEHIND must be an integer");
        }
        return bestBlockNumber - lookBehind;
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
        return blockNumber;
    }

    return bestBlockNumber - 100;
}

interface Progress {
    blockNumber: number;
    retry: number;
}

function createWatchdog(timeout: number): Watchdog<Progress> {
    let stalled = false;
    const dog = new Watchdog<Progress>(timeout * 1000);
    dog.on("reset", ({ data }, _) => {
        stalled = true;
        const message =
            `fee-monitor has been stalled for ${timeout} seconds:` +
            JSON.stringify(data, null, "    ");
        console.warn(message);
        slack.sendError(message);
        email.sendError(message);
    });
    dog.on("feed", ({ data }, _) => {
        if (stalled) {
            stalled = false;
            const message = JSON.stringify(data, null, "    ");
            console.warn(message);
            const title = "has been recovered to normal.";
            slack.sendInfo(title, message);
            email.sendInfo(title, message);
        }
    });
    return dog;
}

async function main() {
    let blockNumber = await startFrom();

    let lastReportedBlockNumber = blockNumber;
    let lastReportedDate = new Date().getUTCDate();
    const dynamicChecker = new DynamicChecker();
    setInterval(() => {
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
                stakeholders.push(`<li>${address}: ${balance.toString(10)}</li>`);
            }
            const reports = [];
            reports.push(
                `<p>Block between ${lastReportedBlockNumber} ~ ${currentBlockNumber} are checked</p>`,
            );
            reports.push(`<h3>Stakeholders</h3>`);
            reports.push(`<ul>${stakeholders.join("<br />\r\n")}</ul>`);

            email.sendInfo("is working.", `${reports.join("\r\n")}`);
            lastReportedDate = now.getUTCDate();
            lastReportedBlockNumber = currentBlockNumber;
        })().catch(console.error);
    }, 60_000); // 1 minute interval

    const dog = createWatchdog(30);
    for (;;) {
        console.log();
        console.log(`BlockNumber: ${blockNumber}`);
        for (let retry = 1; ; retry++) {
            try {
                dog.feed({
                    data: { blockNumber, retry },
                });
                await checkBlock(blockNumber, dynamicChecker);
                break;
            } catch (e) {
                if (retry === 10) {
                    console.error(`Too many retries: ${retry}`);
                    throw e;
                }
                console.error(`Retry ${e}. wait for ${retry} sec(s)`);
                await new Promise(resolve => setTimeout(resolve, 1000 * retry));
            }
        }
        blockNumber = await getNextBlockNumber(blockNumber);
        fs.writeFileSync(`lastBlockNumber.${SERVER}`, blockNumber.toString(10), "utf8");
    }
}

main().catch(error => {
    console.log({ error });
    slack.sendError(error);
    email.sendError(error.message);
    throw error;
});
