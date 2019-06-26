import Rpc from "codechain-rpc";
import getDelegationsOf from "./getDelegationsOf";
import getStakeholders from "./getStakeholders";

export default async function getDelegations(
    networkId: string,
    rpc: Rpc,
    blockNumber: number
): Promise<Map<string, number>> {
    const stakeholders = await getStakeholders(networkId, rpc, blockNumber);

    const result = new Map();
    for (const stakeholder of stakeholders) {
        const delegations = await getDelegationsOf(networkId, rpc, blockNumber, stakeholder);
        for (const [delegatee, quantity] of delegations.entries()) {
            result.set(delegatee, (result.get(delegatee) || 0) + quantity);
        }
    }
    return result;
}

