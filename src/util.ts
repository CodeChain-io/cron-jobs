import { PlatformAddress } from "codechain-primitives/lib";
import { AssetTransaction, Transaction } from "codechain-sdk/lib/core/Transaction";
import { localKeyStore, sdk } from "./configs";

export type Writable<T> = { -readonly [P in keyof T]-?: T[P] };

export async function createApprovedTx<Tx extends Transaction & AssetTransaction>(params: {
    tx: Tx;
    approvers: PlatformAddress[];
}): Promise<Tx> {
    const keyStore = await localKeyStore;
    const tx = params.tx as { approvals?: string[] };
    tx.approvals = await Promise.all(
        params.approvers.map(
            async approver =>
                `0x${await sdk.key.approveTransaction(params.tx, {
                    account: approver,
                    keyStore,
                })}`,
        ),
    );
    return params.tx as Tx;
}

export function assert(expr: () => boolean) {
    const result = expr();
    if (result === false) {
        throw new Error("Assert: " + expr.toString());
    }
}

export function pickRandom<T>(pool: T[], predicate?: (item: T) => boolean): T | null {
    let filtered: T[];
    if (predicate) {
        filtered = pool.filter(predicate);
    } else {
        filtered = pool;
    }
    if (filtered.length === 0) {
        return null;
    }
    const index = Math.floor(Math.random() * filtered.length);
    return filtered[index];
}

export function pickWeightedRandom<T extends { weight: number }>(pool: T[]): T | null {
    if (pool.length === 0) {
        return null;
    }
    let sum = 0;
    const accum = [];
    for (const item of pool) {
        sum += item.weight;
        accum.push(sum);
    }
    const threshold = Math.random() * sum;
    const index = accum.findIndex(x => threshold <= x);
    return pool[index];
}

export function sleep(seconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

export function makeRandomString(length: number) {
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let text = "";
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }

    return text;
}
