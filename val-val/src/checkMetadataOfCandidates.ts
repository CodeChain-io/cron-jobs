import Rpc from "codechain-rpc";
import getCandidates from "./state/getCandidates";

export default async function checkMetadataOfCandidates(
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
        if (Buffer.from(candidate[2], "hex").toString() !== metadata) {
            throw Error(
                `${address}'s metadata should be "${metadata}" but "${Buffer.from(
                    candidate[2],
                    "hex"
                ).toString()}". #${blockNumber}`
            );
        }
    }
}
