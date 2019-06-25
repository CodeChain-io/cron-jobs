import Rpc from "codechain-rpc";
import getCandidates from "./getCandidates";

export default async function getActiveDeposits(
    networkId: string,
    rpc: Rpc,
    blockNumber: number,
    minDeposit: number
): Promise<Map<string, number>> {
    const candidates = await getCandidates(networkId, rpc, blockNumber);
    return new Map(Array.from(candidates.entries()).map(([pubkey, [deposit, ,]]: [string, [number, number, string]]): [string, number] => [pubkey, deposit])
        .filter(([, deposit]: [string, number]) => deposit >= minDeposit));
}

