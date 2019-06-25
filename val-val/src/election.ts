import Rpc from "codechain-rpc";
import getActiveDeposits from "./state/getActiveDeposits";
import getDelegations from "./state/getDelegations";
import getValidators from "./state/getValidators";

function elect(
    deposits: Map<string, number>,
    delegations: Map<string, number>,
    minNumOfValidators: number,
    maxNumOfValidators: number
): [number, number, number, string][] {
    const candidates: [number, number, number, string][] = [];
    for (const [address, deposit] of deposits.entries()) {
        const delegation = delegations.get(address);
        if (delegation == null) {
            continue;
        }
        candidates.push([delegation, delegation, deposit, address]);
    }

    candidates.sort((lhs, rhs) => {
        if (lhs[1] === rhs[1]) {
            return lhs[2] - rhs[2];
        }
        return lhs[1] - rhs[1];
    });
    candidates.reverse();

    const validators = candidates.slice(0, maxNumOfValidators);
    if (candidates.length <= maxNumOfValidators) {
        return validators;
    }
    const cutOff = candidates[maxNumOfValidators];
    return validators.filter(
        ([, delegation, deposit]: [number, number, number, string], index) => {
            if (index < minNumOfValidators) {
                return true;
            }
            if (cutOff[1] !== delegation) {
                return cutOff[1] < delegation;
            }
            return cutOff[2] < deposit;
        }
    );
}

export default async function check(
    networkId: string,
    rpc: Rpc,
    blockNumber: number
): Promise<void> {
    const params = (await rpc.chain.getCommonParams({
        blockNumber
    }))!;
    const minDeposit =
        typeof params.minDeposit! === "number"
            ? params.minDeposit!
            : parseInt(params.minDeposit! as string, undefined);

    const validators = await getValidators(networkId, rpc, blockNumber);

    const minNumOfValidators =
        typeof params.minNumOfValidators! === "number"
            ? params.minNumOfValidators!
            : parseInt(params.minNumOfValidators! as string, undefined);
    if (validators.size < minNumOfValidators) {
        throw Error(
            `The number of validators is ${validators.size} at ${blockNumber}. min: ${minNumOfValidators}`
        );
    }

    const maxNumOfValidators =
        typeof params.maxNumOfValidators! === "number"
            ? params.maxNumOfValidators!
            : parseInt(params.maxNumOfValidators! as string, undefined);
    if (maxNumOfValidators < validators.size) {
        throw Error(
            `The number of validators is ${validators.size} at ${blockNumber}. max: ${maxNumOfValidators}`
        );
    }

    const delegations = await getDelegations(networkId, rpc, blockNumber);
    const deposits = await getActiveDeposits(
        networkId,
        rpc,
        blockNumber,
        minDeposit
    );

    const calculated = elect(
        deposits,
        delegations,
        minNumOfValidators,
        maxNumOfValidators
    );
    if (validators.size !== calculated.length) {
        throw Error(
            `Validators are different from the calculation. calculated: ${JSON.stringify(
                calculated
            )} actual: ${JSON.stringify(
                Array.from(validators.entries())
            )} at ${blockNumber}.`
        );
    }

    for (const [weight, delegation, deposit, address] of calculated) {
        const validator = validators.get(address);
        if (validator == null) {
            throw Error(`${address} should be validator at ${blockNumber}.`);
        }
        if (weight !== validator[0]) {
            throw Error(
                `The weight of ${address} must be ${validator[0]} but ${weight} at ${blockNumber}.`
            );
        }
        if (delegation !== validator[1]) {
            throw Error(
                `The delegation of ${address} must be ${validator[1]} but ${delegation} at ${blockNumber}.`
            );
        }
        if (deposit !== validator[2]) {
            throw Error(
                `The deposit of ${address} must be ${validator[2]} but ${deposit} at ${blockNumber}.`
            );
        }
    }
}
