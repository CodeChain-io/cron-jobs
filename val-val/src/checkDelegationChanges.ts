import Rpc from "codechain-rpc";
import getDelegations from "./state/getDelegations";
import getJailed from "./state/getJailed";

export default async function checkDelegationChanges(
    networkId: string,
    rpc: Rpc,
    blockNumber: number,
    delegationChanges: Map<string, number>
): Promise<void> {
    if (delegationChanges.size === 0) {
        return;
    }

    const previous = await getDelegations(networkId, rpc, blockNumber - 1);
    const current = await getDelegations(networkId, rpc, blockNumber);
    const jailed = await getJailed(networkId, rpc, blockNumber);
    for (const address of jailed.keys()) {
        previous.delete(address);
    }
    for (const [address, quantity] of delegationChanges.entries()) {
        previous.set(address, (previous.get(address) || 0) + quantity);
    }

    for (const [address, expected] of previous.entries()) {
        const actual = current.get(address) || 0;
        if (actual !== expected) {
            throw Error(
                `${address} must have ${expected} delegations, but has ${actual}. #${blockNumber}`
            );
        }
        current.delete(address);
    }
    for (const [address, actual] of current.entries()) {
        throw Error(
            `${address} must not have delegations, but has ${actual}. #${blockNumber}`
        );
    }
}
