import Rpc from "codechain-rpc";
import checkElection from "./election";
import {
    createLastCheckedBlockIfNotExist,
    readLastCheckedBlock,
    writeLastCheckedBlock
} from "./file";
import checkJailed from "./jailed";

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

    const networkId = await rpc.chain.getNetworkId();
    console.log(`Start from #${lastCheckedBlock + 1}`);

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
            const [lastBlockOfTheTerm, termId] = await termMetadata(
                rpc,
                blockNumber
            );
            if (termId !== lastTermId) {
                if (termId !== lastTermId + 1) {
                    throw Error(
                        `The term id must be increased by one. previous: ${lastTermId} current: ${termId} #${blockNumber}`
                    );
                }
                if (lastBlockOfTheTerm !== blockNumber) {
                    throw Error(
                        `The last block number in the metadata is ${lastBlockOfTheTerm} but it should be ${blockNumber}. #${blockNumber}`
                    );
                }
                lastTermId = termId;
                await checkElection(networkId, rpc, blockNumber);
                await checkJailed(networkId, rpc, blockNumber, termId);
            }
            // TODO: read block
            // 0. double vote report
            // 1. deposit
            //   - metadata
            //   - amount
            // 2. delegate
            // 3. revoke

            if (blockNumber % 1000 === 0) {
                lastCheckedBlock = blockNumber;
                console.log(`Block #${lastCheckedBlock} is validated`);
                await writeLastCheckedBlock(lastCheckedBlock);
            }
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
