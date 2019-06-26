import { PlatformAddress } from "codechain-primitives/lib";
import Rpc from "codechain-rpc";
import getUndelegatedStake from "./state/getUndelegatedStake";

export default async function checkStakeChanges(
    rpc: Rpc,
    blockNumber: number,
    stakeChanges: Map<string, number>
): Promise<void> {
    for (const [stakeholder, change] of stakeChanges) {
        const address = PlatformAddress.fromString(stakeholder);
        const previous = await getUndelegatedStake(
            rpc,
            blockNumber - 1,
            address
        );
        const current = await getUndelegatedStake(rpc, blockNumber, address);

        if (previous + change !== current) {
            throw Error(
                `The undelegated stake of ${stakeholder} should be ${previous +
                    change}, but ${current}. #${blockNumber}`
            );
        }
    }
}
