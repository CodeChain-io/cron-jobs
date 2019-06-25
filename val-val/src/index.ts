import Rpc from "codechain-rpc";
import checkElection from "./election";
import {
    createLastCheckedBlockIfNotExist,
    readLastCheckedBlock,
    writeLastCheckedBlock
} from "./file";
import checkJailed from "./jailed";
import getTermMetadata from "./state/getTermMetadata";


async function main() {
    if (await createLastCheckedBlockIfNotExist()) {
        console.log("New lastBlockNumber file is created");
    }

    const rpc = new Rpc(process.env.RPC_SERVER!);

    let previousCheckedBlock = await readLastCheckedBlock();
    const term = await getTermMetadata(rpc, previousCheckedBlock);
    const previousLastBlockOfTheTerm = term[0];
    let previousTermId = term[1];

    const networkId = await rpc.chain.getNetworkId();
    console.log(`Start from #${previousCheckedBlock + 1}`);
    const blockAuthors: Set<string> = new Set();
    for (
        let blockNumber = previousLastBlockOfTheTerm + 1;
        blockNumber < previousCheckedBlock;
        blockNumber += 1
    ) {
        const block = (await rpc.chain.getBlockByNumber({ blockNumber }))!;
        blockAuthors.add((block as any).author);
    }

    while (true) {
        const currentBestBlock = await rpc.chain.getBestBlockNumber();
        if (previousCheckedBlock === currentBestBlock) {
            console.log("There are no blocks to validate. Wait 10 seconds.");
            await wait(10_000); // wait 10 seconds
            continue;
        }

        for (
            let blockNumber = previousCheckedBlock + 1;
            blockNumber <= currentBestBlock;
            blockNumber += 1
        ) {
            const [lastBlockOfTheTerm, termId] = await getTermMetadata(
                rpc,
                blockNumber
            );

            const block = (await rpc.chain.getBlockByNumber({ blockNumber }))!;
            blockAuthors.add((block as any).author);

            if (termId !== previousTermId) {
                if (termId !== previousTermId + 1) {
                    throw Error(
                        `The term id must be increased by one. previous: ${previousTermId} current: ${termId} #${blockNumber}`
                    );
                }
                if (lastBlockOfTheTerm !== blockNumber) {
                    throw Error(
                        `The last block number in the metadata is ${lastBlockOfTheTerm} but it should be ${blockNumber}. #${blockNumber}`
                    );
                }
                previousTermId = termId;

                await checkElection(networkId, rpc, blockNumber);
                await checkJailed(
                    networkId,
                    rpc,
                    blockNumber,
                    termId,
                    blockAuthors
                );
            }
            // TODO: read block
            // 0. double vote report
            // 1. deposit
            //   - metadata
            //   - amount
            // 2. delegate
            // 3. revoke

            if (blockNumber % 1000 === 0) {
                previousCheckedBlock = blockNumber;
                console.log(`Block #${previousCheckedBlock} is validated`);
                await writeLastCheckedBlock(previousCheckedBlock);
            }
        }

        previousCheckedBlock = currentBestBlock;
        console.log(`Block #${previousCheckedBlock} is validated`);
        await writeLastCheckedBlock(previousCheckedBlock);
        await wait(1_000); // wait 1 second
    }
}

main().catch(console.error);

function wait(ms: number) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}
