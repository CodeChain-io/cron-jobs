import Rpc from "codechain-rpc";
import checkDelegationChanges from "./checkDelegationChanges";
import checkStakeChanges from "./checkStakeChanges";
import checkWeightChanges from "./checkWeightChanges";
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
import returnDelegationsOfReleased from "./returnDelegationsOfReleased";
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
    const [term, networkId] = await Promise.all([
        getTermMetadata(rpc, previousCheckedBlock),
        rpc.chain.getNetworkId()
    ]);
    const previousLastBlockOfTheTerm = term[0];
    let previousTermId = term[1];

    console.log(`Start from #${previousCheckedBlock + 1}`);
    const precedingBlocks = [];
    for (
        let blockNumber = previousLastBlockOfTheTerm + 1;
        blockNumber < previousCheckedBlock;
        blockNumber += 1
    ) {
        precedingBlocks.push(rpc.chain.getBlockByNumber({ blockNumber }));
    }

    const blockAuthors = new Set<string>(
        (await Promise.all(precedingBlocks)).map(b => b!.author)
    );

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

                    // FIXME: Validate the deposit changes.
                    const [
                        stakeChanges,
                        nominations,
                        delegationChanges
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

                        const validatorsPromise = checkElection(
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

                        await returnDelegationsOfReleased(
                            networkId,
                            rpc,
                            blockNumber,
                            new Set(released.keys()),
                            stakeChanges
                        );

                        const validators = await validatorsPromise;
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
                    } else {
                        if (termId === 1) {
                            await checkWeightChanges(
                                networkId,
                                rpc,
                                blockNumber
                            );
                        }
                    }

                    await Promise.all([
                        checkStakeChanges(rpc, blockNumber, stakeChanges),
                        checkDelegationChanges(
                            networkId,
                            rpc,
                            blockNumber,
                            delegationChanges
                        )
                    ]);

                    const logs = [];
                    if (nominations.size !== 0) {
                        logs.push(
                            `${Array.from(
                                nominations.entries()
                            )} are nominated.`
                        );
                    }
                    if (stakeChanges.size !== 0) {
                        logs.push(
                            `Stake changes: ${Array.from(
                                stakeChanges.entries()
                            )}`
                        );
                    }
                    if (delegationChanges.size !== 0) {
                        logs.push(
                            `Delegations: ${Array.from(
                                delegationChanges.entries()
                            )}`
                        );
                    }

                    if (logs.length !== 0) {
                        console.group(`At block #${blockNumber}`);
                        for (const log of logs) {
                            console.log(log);
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
            await Promise.all([
                writeLastCheckedBlock(previousCheckedBlock),
                wait(1_000)
            ]); // wait 1 second
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
