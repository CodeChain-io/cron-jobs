import { Block, Timelock } from "codechain-sdk/lib/core/classes";
import CodeChain from "../codeChain";
import { delay } from "../util";

let emptyTransaction: boolean = false;

export async function run(
    codeChain: CodeChain,
    timelockType: Timelock["type"]
) {
    try {
        emptyTransaction = true;
        await codeChain.fillMoneyForNoop();
        runEmptyTransaction(codeChain);

        const startBlock = await codeChain.getCurrentBlock();
        console.log(
            "StartBlockHeight: %d %d, %s",
            startBlock.number,
            startBlock.timestamp,
            timelockType
        );
        const utxoSet = await codeChain.prepareUTXOs();

        const transaction = await codeChain.createTimeLockTransaction({
            input: utxoSet.popAsset(),
            timelock: createTimelock(startBlock, timelockType)
        });
        await codeChain.sendTransaction(transaction);
        const leastBlock = await codeChain.waitFutureBlock({
            canHandle: transaction
        });

        const result = await codeChain.getResult(transaction);
        if (result === null) {
            throw new Error(
                "The transaction is not processed after 60 seconds"
            );
        }

        if (result === false) {
            throw new Error("TimeLockTransaction has failed");
        }

        const block = await codeChain.getBlockOfTransaction(transaction);
        if (block.number < leastBlock.number) {
            throw new Error(
                "TimeLockTransaction executed before the time lock"
            );
        }

        console.log("Timelock success");
        console.log(
            `StartBlockHeight: ${startBlock.number} ${startBlock.timestamp}`
        );
        console.log(
            `leastBlockHeight: ${leastBlock.number} ${leastBlock.timestamp}`
        );
        console.log(`minedBlockHeight: ${block.number} ${block.timestamp}`);

        emptyTransaction = false;
    } catch (err) {
        emptyTransaction = false;
        throw err;
    }
}

async function runEmptyTransaction(codeChain: CodeChain) {
    while (emptyTransaction) {
        try {
            await codeChain.sendNoopTransaction();
        } catch (err) {
            console.error(err);
        }
        await delay(3 * 1000);
    }
}

function createTimelock(
    currentBlock: Block,
    timelockType: Timelock["type"]
): Timelock {
    switch (timelockType) {
        case "block":
            return {
                type: "block",
                value: currentBlock.number + 10
            };
        case "blockAge":
            return {
                type: "blockAge",
                value: 10
            };
        case "time":
            return {
                type: "time",
                value: currentBlock.timestamp + 30
            };
        case "timeAge":
            return {
                type: "timeAge",
                value: 30
            };
    }
}
