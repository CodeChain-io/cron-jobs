import Rpc from "codechain-rpc";
import getValidators from "./state/getValidators";

export default async function checkWeightChanges(
    networkId: string,
    rpc: Rpc,
    blockNumber: number
): Promise<void> {
    const [previous, current, author] = await Promise.all([
        getValidators(networkId, rpc, blockNumber - 1),
        getValidators(networkId, rpc, blockNumber).then(validators => {
            return Array.from(validators.entries());
        }),
        rpc.chain.getBlockByNumber({ blockNumber }).then(block => block!.author)
    ]);
    const minDelegation = Math.min(
        ...Array.from(previous.values()).map(([, delegation]) => delegation)
    );
    let afterAuthor = false;
    let hasNonZeroWeight = false;
    const weightUpdated = Array.from(previous.entries()).map(
        ([address, [weight, delegation, deposit]]: [
            string,
            [number, number, number]
        ]): [string, number, number, number] => {
            let newWeight = weight;
            if (afterAuthor) {
                newWeight =
                    weight > minDelegation * 2 ? weight - minDelegation * 2 : 0;
            }
            if (address === author) {
                afterAuthor = true;
                newWeight = weight > minDelegation ? weight - minDelegation : 0;
            }
            if (newWeight > 0) {
                hasNonZeroWeight = true;
            }
            return [address, newWeight, delegation, deposit];
        }
    );
    const updated: [string, number, number, number][] = hasNonZeroWeight
        ? weightUpdated
        : weightUpdated.map(([address /*weight*/, , delegation, deposit]) => {
              // fill weight
              return [address, delegation, delegation, deposit];
          });
    updated.sort((lhs, rhs) => {
        if (lhs[1] !== rhs[1]) {
            return lhs[1] - rhs[1];
        }
        if (lhs[2] !== rhs[2]) {
            return lhs[2] - rhs[2];
        }
        return lhs[3] - rhs[3];
    });
    if (updated.length !== current.length) {
        throw Error(`The number of validators are changed. #${blockNumber}`);
    }
    updated.forEach(([address, weight, delegation, deposit], index) => {
        if (current[index][0] !== address) {
            throw Error(
                `${index}-th validator must be ${address}, but ${current[index][0]}. #${blockNumber}`
            );
        }
        if (current[index][1][0] !== weight) {
            throw Error(
                `${index}-th weight must be ${weight}, but ${current[index][1][0]}. #${blockNumber}`
            );
        }
        if (current[index][1][1] !== delegation) {
            throw Error(
                `${index}-th delegation must be ${delegation}, but ${current[index][1][1]}. #${blockNumber}`
            );
        }
        if (current[index][1][2] !== deposit) {
            throw Error(
                `${index}-th deposit must be ${deposit}, but ${current[index][1][2]}. #${blockNumber}`
            );
        }
    });
}
