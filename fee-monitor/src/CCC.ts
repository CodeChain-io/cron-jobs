import { PlatformAddress, U64 } from "codechain-primitives/lib";
import { sdk } from "./config";

export async function getCCCBalances(
    addresses: PlatformAddress[],
    blockNumber: number,
): Promise<{ [address: string]: U64 }> {
    const balances = await Promise.all(
        addresses.map(address => sdk.rpc.chain.getBalance(address, blockNumber)),
    );
    const result: { [address: string]: U64 } = {};
    for (let i = 0; i < addresses.length; i++) {
        result[addresses[i].value] = balances[i];
    }
    return result;
}

export class CCCTracer {
    public totalFee = new U64(0);
    public totalMinFee = new U64(0);
    public deposits: {
        [address: string]: U64;
    } = {};
    public withdraws: {
        [address: string]: U64;
    } = {};

    public collect(fee: U64, minFee: U64) {
        this.totalFee = this.totalFee.plus(fee);
        this.totalMinFee = this.totalMinFee.plus(minFee);
    }

    public deposit(address: PlatformAddress, amount: U64) {
        if (address.value in this.deposits) {
            this.deposits[address.value] = this.deposits[address.value].plus(amount);
        } else {
            this.deposits[address.value] = amount;
        }
    }

    public withdraw(address: PlatformAddress, amount: U64) {
        if (address.value in this.withdraws) {
            this.withdraws[address.value] = this.withdraws[address.value].plus(amount);
        } else {
            this.withdraws[address.value] = amount;
        }
    }

    public adjust(address: PlatformAddress, amount: U64): U64 {
        if (address.value in this.deposits) {
            amount = amount.plus(this.deposits[address.value]);
        }
        if (address.value in this.withdraws) {
            amount = amount.minus(this.withdraws[address.value]);
        }
        return amount;
    }
}
