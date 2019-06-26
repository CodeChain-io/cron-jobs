import Rpc from "codechain-rpc";
import getDelegationsOf from "./state/getDelegationsOf";
import getStakeholders from "./state/getStakeholders";

export default async function returnDelegationsOfReleased(
    networkId: string,
    rpc: Rpc,
    blockNumber: number,
    released: Set<string>,
    stakes: Map<string, number>
): Promise<void> {
    const stakeholders = await getStakeholders(networkId, rpc, blockNumber);
    await Promise.all(
        stakeholders.map(async stakeholder => {
            const delegations = await getDelegationsOf(
                networkId,
                rpc,
                blockNumber - 1,
                stakeholder
            );
            for (const [delegatee, quantity] of delegations) {
                if (released.has(delegatee)) {
                    const addr = stakeholder.toString();
                    stakes.set(addr, (stakes.get(addr) || 0) + quantity);
                }
            }
        })
    );
}
