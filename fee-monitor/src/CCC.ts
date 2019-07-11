import { PlatformAddress, U64 } from "codechain-sdk/lib/core/classes";
import { sdk } from "./config";

export async function getCCCBalances(
    addresses: PlatformAddress[],
    blockNumber: number,
): Promise<Map<string, U64>> {
    const balances = await Promise.all(
        addresses.map(address => sdk.rpc.chain.getBalance(address, blockNumber)),
    );
    const result = new Map();
    for (let i = 0; i < addresses.length; i++) {
        result.set(addresses[i].value, balances[i]);
    }
    return result;
}

export type SettleMoment = { tag: "block"; value: number } | { tag: "term"; value: number };

export class CCCTracer {
    public totalFee = new U64(0);
    public totalMinFee = new U64(0);
    public deposits: Map<string, U64> = new Map();
    public withdraws: Map<string, U64> = new Map();

    public collect(fee: U64, minFee: U64) {
        this.totalFee = this.totalFee.plus(fee);
        this.totalMinFee = this.totalMinFee.plus(minFee);
    }

    public deposit(address: PlatformAddress, amount: U64) {
        const deposit = this.deposits.get(address.value);
        if (deposit != null) {
            this.deposits.set(address.value, deposit.plus(amount));
        } else {
            this.deposits.set(address.value, amount);
        }
    }

    public withdraw(address: PlatformAddress, amount: U64) {
        const withdraw = this.withdraws.get(address.value);
        if (withdraw != null) {
            this.withdraws.set(address.value, withdraw.plus(amount));
        } else {
            this.withdraws.set(address.value, amount);
        }
    }

    public adjust(address: PlatformAddress, amount: U64): U64 {
        const deposit = this.deposits.get(address.value);
        if (deposit != null) {
            amount = amount.plus(deposit);
        }
        const withdraw = this.withdraws.get(address.value);
        if (withdraw != null) {
            amount = amount.minus(withdraw);
        }
        return amount;
    }
}
