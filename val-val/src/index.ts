import Rpc from "codechain-rpc";
import {
    createLastCheckedBlockIfNotExist,
    readLastCheckedBlock,
    writeLastCheckedBlock
} from "./file";

async function termMetadata(
    rpc: Rpc,
    blockNumber: number
): Promise<[number, number]> {
    const [lastBlock, termId] = (await rpc.chain.getTermMetadata({
        blockNumber
    }))!;
    return [lastBlock, termId];
}

async function main() {
    if (await createLastCheckedBlockIfNotExist()) {
        console.log("New lastBlockNumber file is created");
    }

    const rpc = new Rpc(process.env.RPC_SERVER!);

    let lastCheckedBlock = await readLastCheckedBlock();
    let [, lastTermId] = await termMetadata(rpc, lastCheckedBlock);

    while (true) {
        const currentBestBlock = await rpc.chain.getBestBlockNumber();
        if (lastCheckedBlock === currentBestBlock) {
            console.log("There are no blocks to validate. Wait 10 seconds.");
            await wait(10_000); // wait 10 seconds
            continue;
        }

        for (
            let blockNumber = lastCheckedBlock + 1;
            blockNumber <= currentBestBlock;
            blockNumber += 1
        ) {
            const [, termId] = await termMetadata(rpc, blockNumber);
            if (termId !== lastTermId) {
                // TODO: do term change event
                // 1. release jailed
                // 2. check election
                lastTermId = termId;
            }
            // TODO: read block
            // 0. double vote report
            // 1. deposit
            //   - metadata
            //   - amount
            // 2. delegate
            // 3. revoke
        }

        lastCheckedBlock = currentBestBlock;
        console.log(`Block #${lastCheckedBlock} is validated`);
        await writeLastCheckedBlock(lastCheckedBlock);
        await wait(1_000); // wait 1 second
    }
}

main().catch(console.error);

function wait(ms: number) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}
