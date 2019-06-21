import * as chai from "chai";
import { Timelock } from "codechain-sdk/lib/core/classes";
import CodeChain from "../codeChain";
import { createTimelock, delay } from "../util";

export async function run(
    codeChain: CodeChain,
    timelockType: Timelock["type"]
) {
    const emptyTransactionCommand = {
        run: true
    };
    try {
        await codeChain.fillMoneyForNoop();
        runEmptyTransaction(codeChain, emptyTransactionCommand);

        const startBlock = await codeChain.getCurrentBlock();
        console.log(
            "StartBlockHeight: %d %d, %s",
            startBlock.number,
            startBlock.timestamp,
            timelockType
        );
        const utxoSet = await codeChain.prepareUTXOs(startBlock);

        const invalidTransaction = await codeChain.createTransaction({
            input: utxoSet.getTimelockAsset(timelockType),
            timelock: createTimelock(startBlock, timelockType),
            useTimelockOnInput: false
        });

        const invalidTxHash = await codeChain.sendTransaction(
            invalidTransaction
        );
        console.log(`Send InvalidTx, Hash: ${invalidTxHash.toString()}`);

        const validTransaction = await codeChain.createTransaction({
            input: utxoSet.getTimelockAsset(timelockType),
            timelock: createTimelock(startBlock, timelockType),
            useTimelockOnInput: true
        });

        const validTxHash = await codeChain.sendTransaction(validTransaction);
        console.log(`Send validTxHash, Hash: ${validTxHash.toString()}`);

        await codeChain.waitTransactionMined(validTxHash);
        const containsInvalid = await codeChain.containsTransaction(
            invalidTxHash
        );
        chai.assert.strictEqual(false, containsInvalid);

        const leastBlock = await codeChain.waitFutureBlock({
            canHandle: validTransaction
        });

        const insertedBlock = await codeChain.getBlockOfTransaction(
            validTransaction
        );

        console.log("Timelock success");
        console.log(
            `StartBlockHeight: ${startBlock.number} ${startBlock.timestamp}`
        );
        console.log(
            `leastBlockHeight: ${leastBlock.number} ${leastBlock.timestamp}`
        );
        console.log(
            `InsertedBlockHeight: ${insertedBlock.number} ${insertedBlock.timestamp}`
        );
        chai.assert(insertedBlock.number >= leastBlock.number);

        emptyTransactionCommand.run = false;
    } catch (err) {
        emptyTransactionCommand.run = false;
        throw err;
    }
}

async function runEmptyTransaction(
    codeChain: CodeChain,
    command: { run: boolean }
) {
    while (command.run) {
        try {
            await codeChain.sendNoopTransaction();
        } catch (err) {
            console.error(err);
        }
        await delay(3 * 1000);
    }
}

if (require.main === module) {
    async function main() {
        const codeChain = new CodeChain();
        await run(codeChain, "block");
        await run(codeChain, "blockAge");
        await run(codeChain, "time");
        await run(codeChain, "timeAge");
    }

    main().catch(console.error);
}
