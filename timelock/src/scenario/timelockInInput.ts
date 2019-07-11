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

        const transaction = await codeChain.createTransaction({
            input: utxoSet.popPBKHAsset(),
            timelock: createTimelock(startBlock, timelockType),
            useTimelockOnInput: true,
            signer: "first"
        });
        await codeChain.sendTransaction(transaction);
        const leastBlock = await codeChain.waitFutureBlock({
            canHandle: transaction
        });

        await codeChain.waitTransactionMined(transaction.hash());

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
