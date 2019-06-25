import Rpc from "codechain-rpc";
import checkElection from "./election";
import extractStakeActions from "./extractStakeActions";
import {
    createLastCheckedBlockIfNotExist,
    readLastCheckedBlock,
    writeLastCheckedBlock
} from "./file";
import checkJailed from "./jailed";
import createEmail from "./noti/email";
import createSlack from "./noti/slack";
import getCandidates from "./state/getCandidates";
import getTermMetadata from "./state/getTermMetadata";

async function main() {
    const email = createEmail({
        sendgridApiKey: process.env.SENDGRID_API_KEY,
        to: process.env.SENDGRID_TO,
        tag: "val-val"
    });
    const slack = createSlack("val-val", process.env.SLACK_WEBHOOK_URL);

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
        try {
            const currentBestBlock = await rpc.chain.getBestBlockNumber();
            if (previousCheckedBlock === currentBestBlock) {
                console.log(
                    "There are no blocks to validate. Wait 10 seconds."
                );
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
                try {
                    const block = (await rpc.chain.getBlockByNumber({
                        blockNumber
                    }))!;
                    blockAuthors.add((block as any).author);

                    // FIXME: Validate the CCS changes.
                    // FIXME: Validate the deposit changes.
                    const [
                        ,
                        /*ccs*/
                        nominations /*ccs delegations*/
                    ] = await extractStakeActions(rpc, block);

                    await checkMetadataOfCandidates(
                        networkId,
                        rpc,
                        nominations,
                        blockNumber
                    );

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

                        const validators = await checkElection(
                            networkId,
                            rpc,
                            blockNumber
                        );
                        const [released, jailed] = await checkJailed(
                            networkId,
                            rpc,
                            blockNumber,
                            termId,
                            blockAuthors
                        );
                        console.group(
                            `New validators are elected for term #${termId}. #${blockNumber}`
                        );
                        console.log(
                            `${JSON.stringify(Array.from(validators.values()))}`
                        );
                        if (released.size !== 0) {
                            console.log(
                                `${Array.from(released.keys())} are released.`
                            );
                        }
                        if (jailed.size !== 0) {
                            console.log(
                                `${Array.from(jailed.values())} are jailed.`
                            );
                        }
                        console.groupEnd();
                    }

                    if (blockNumber % 1000 === 0) {
                        previousCheckedBlock = blockNumber;
                        console.log(
                            `Block #${previousCheckedBlock} is validated`
                        );
                        await writeLastCheckedBlock(previousCheckedBlock);
                    }
                } catch (err) {
                    slack.sendError(err.message);
                    email.sendError(err.message);
                }
                previousTermId = termId;
            }

            previousCheckedBlock = currentBestBlock;
            console.log(`Block #${previousCheckedBlock} is validated`);
            await writeLastCheckedBlock(previousCheckedBlock);
            await wait(1_000); // wait 1 second
        } catch (err) {
            slack.sendError(`Fail to run: ${err}`);
            email.sendError(`Fail to run: ${err}`);
        }
    }
}

main().catch(console.error);

function wait(ms: number) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

async function checkMetadataOfCandidates(
    networkId: string,
    rpc: Rpc,
    nominations: Map<string, string>,
    blockNumber: number
) {
    const candidates = await getCandidates(networkId, rpc, blockNumber);
    for (const [address, metadata] of nominations.entries()) {
        const candidate = candidates.get(address);
        if (candidate == null) {
            throw Error(`${address} is not nominated. #${blockNumber}`);
        }
        if (candidate[2] !== metadata) {
            throw Error(
                `${address}'s metadata should be ${metadata} but ${candidate[2]}. #${blockNumber}`
            );
        }
    }
}
