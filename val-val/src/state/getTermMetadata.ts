import Rpc from "codechain-rpc";

export default async function getTermMetadata(
    rpc: Rpc,
    blockNumber: number
): Promise<[number, number]> {
    const [lastBlock, termId] = (await rpc.chain.getTermMetadata({
        blockNumber
    }))!;
    return [lastBlock, termId];
}

