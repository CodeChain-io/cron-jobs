import * as chai from "chai";
import CodeChain from "../codeChain";
import { delay } from "../util";

let emptyTransaction: boolean = false;

export async function run(codeChain: CodeChain) {
    try {
        emptyTransaction = true;
        await codeChain.fillMoneyForNoop();
        runEmptyTransaction(codeChain);

        const startBlockHeight = await codeChain.getCurrentBlockHeight();
        console.log(`StartBlockHeight: ${startBlockHeight}`);
        const utxoSet = await codeChain.prepareUTXOs();

        const transaction = await codeChain.createTimeLockTransaction({
            input: utxoSet.popAsset(),
            timelock: {
                type: "block",
                value: startBlockHeight + 10
            }
        });
        await codeChain.sendTransaction(transaction);
        const leastBlock = await codeChain.waitFutureBlock({
            canHandle: transaction
        });

        chai.assert.isAtLeast(leastBlock.number, startBlockHeight + 10);

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
        console.log(`StartBlockHeight: ${startBlockHeight}`);
        console.log(`leastBlockHeight: ${leastBlock.number}`);
        console.log(`minedBlockHeight: ${block.number}`);

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
