import * as fs from "fs";
import { email, sdk, slack, MINIMUM_FEES, SERVER } from "./config";
import { Pay, PlatformAddress, U64, UnwrapCCC, WrapCCC } from "codechain-sdk/lib/core/classes";
import { Custom } from "codechain-sdk/lib/core/transaction/Custom";
import { getStakeholders, getWeights, Weight } from "./Stake";
import { getCCCBalances, CCCTracer } from "./CCC";
import { Watchdog } from "watchdog";

function distribute(tracer: CCCTracer, author: PlatformAddress, weights: Weight[]) {
    const totalWeights = weights
        .map(({ weight }) => weight)
        .reduce((a, b) => a.plus(b), new U64(0));
    const totalMinFee = tracer.totalMinFee;
    let distributed = new U64(0);
    for (const { account, weight } of weights) {
        const fraction = totalMinFee.times(weight).idiv(totalWeights);
        distributed = distributed.plus(fraction);
        tracer.deposit(account, fraction);
    }
    tracer.deposit(author, tracer.totalFee.minus(distributed));
}
async function checkBlock(blockNumber: number) {
    const block = (await sdk.rpc.chain.getBlock(blockNumber))!;

    let tracer = new CCCTracer();
    let txTypes = block.transactions.map(tx => tx.unsigned.type()).join(", ");
    console.log(`TxTypes: ${txTypes}`);
    for (const signedTransaction of block.transactions) {
        const tx = signedTransaction.unsigned;

        const signer = PlatformAddress.fromPublic(signedTransaction.getSignerPublic(), {
            networkId: sdk.networkId,
        });
        const fee = tx.fee()!;
        const minFee = new U64(MINIMUM_FEES[tx.type()]);
        tracer.withdraw(signer, fee);
        tracer.collect(fee, minFee);

        if (tx instanceof Pay) {
            interface PayBody {
                receiver: PlatformAddress;
                quantity: U64;
            }
            let { receiver, quantity }: PayBody = tx as any;
            tracer.withdraw(signer, quantity);
            tracer.deposit(receiver, quantity);
        } else if (tx instanceof WrapCCC) {
            interface WrapCCCBody {
                payer: PlatformAddress;
                quantity: U64;
            }
            let { payer, quantity }: WrapCCCBody = tx as any;
            tracer.withdraw(payer, quantity);
        } else if (tx instanceof UnwrapCCC) {
            interface UnwrapCCCBody {
                _transaction: {
                    receiver: PlatformAddress;
                    burn: {
                        prevOut: { quantity: U64 };
                    };
                };
            }
            let {
                _transaction: {
                    receiver,
                    burn: {
                        prevOut: { quantity },
                    },
                },
            }: UnwrapCCCBody = tx as any;
            tracer.deposit(receiver, quantity);
        } else if (tx instanceof Custom) {
            console.error("Custom not supported yet");
        }
    }

    const author = block.author;
    const weights = await getWeights(blockNumber);

    distribute(tracer, author, weights);

    let aggregated = {
        server: SERVER,
        blockNumber,
        errors: [] as any[],
    };

    const authorBefore = await sdk.rpc.chain.getBalance(author, blockNumber - 1);
    const authorAfter = await sdk.rpc.chain.getBalance(author, blockNumber);

    if (!tracer.adjust(author, authorBefore).eq(authorAfter)) {
        const error = {
            type: "author",
            account: author.value,
            expected: tracer.adjust(author, authorBefore).toString(10),
            actual: authorAfter.toString(10),
        };
        console.error(error);
        aggregated.errors.push(error);
    }

    const stakeholders = await getStakeholders(blockNumber);
    const stakeholderBefores = await getCCCBalances(stakeholders, blockNumber - 1);
    const stakeholderAfters = await getCCCBalances(stakeholders, blockNumber);

    for (const stakeholder of stakeholders) {
        const expected = tracer.adjust(stakeholder, stakeholderBefores.get(stakeholder.value)!);
        const actual = stakeholderAfters.get(stakeholder.value)!;
        if (!expected.eq(actual)) {
            const error = {
                type: "stakeholder",
                account: stakeholder.value,
                expected,
                actual,
            };
            console.error(error);
            aggregated.errors.push(error);
        }
    }
    if (aggregated.errors.length > 0) {
        slack.sendWarning(JSON.stringify(aggregated, null, "    "));
        const errors = aggregated.errors
            .map(error => `<li>${JSON.stringify(error)}</li>`)
            .join("<br />\r\n");
        email.sendWarning(`
        <p>block number: ${aggregated.blockNumber}</p>
        <ul>${errors}</ul>
        `);
    } else {
        console.log("Block is Okay");
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
    setInterval(() => {
        const now = new Date();
        if (now.getUTCDate() === lastReportedDate) {
            return;
        }
        const currentBlockNumber = blockNumber;
        email.sendInfo(
            "is working.",
            `Block between ${lastReportedBlockNumber} ~ ${currentBlockNumber} are checked`,
        );
        lastReportedDate = now.getUTCDate();
        lastReportedBlockNumber = currentBlockNumber;
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
                await checkBlock(blockNumber);
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
