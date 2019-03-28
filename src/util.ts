import { H160, H160Value, PlatformAddress, U64 } from "codechain-primitives/lib";
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

export function assert(expr: () => boolean, obj?: any) {
    const result = expr();
    if (result === false) {
        if (obj) {
            console.error(obj);
        }
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

export function pickRandomSize<T>(
    pool: T[],
    range: number | [number, number], // inclusive
    predicate?: (item: T) => boolean,
): T[] {
    let remaining = predicate ? pool.filter(predicate) : [...pool];
    let [lower, upper] = typeof range === "number" ? [range, range] : range;
    upper = Math.min(upper, remaining.length);

    assert(() => lower >= 0 && upper <= remaining.length);

    let result = [];
    const N = Math.floor(Math.random() * (upper + 1 - lower) + lower);
    for (let i = 0; i < N; i++) {
        const pick = pickRandom(remaining)!;
        remaining.splice(remaining.indexOf(pick), 1);
        result.push(pick);
    }
    return result;
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

export class AssetSummarization<T> {
    summaries: { [assetType: string]: { sum: U64; values: T[] } };
    constructor(summerizes: { [assetType: string]: { sum: U64; values: T[] } }) {
        this.summaries = summerizes;
    }

    public get(assetTypeValue: H160Value) {
        const assetType = H160.ensure(assetTypeValue);
        if (this.summaries.hasOwnProperty(assetType.value)) {
            return this.summaries[assetType.value];
        } else {
            return {
                sum: new U64(0),
                values: [],
            };
        }
    }

    public assetTypes(): H160[] {
        return Object.keys(this.summaries).map(H160.ensure);
    }

    all(): { assetType: H160; summary: { sum: U64; values: T[] } }[] {
        const result = [];
        for (const assetType of this.assetTypes()) {
            result.push({ assetType, summary: this.get(assetType) });
        }
        return result;
    }

    public isEquivalentTo<U>(other: AssetSummarization<U>): boolean {
        if (!Object.keys(this.summaries).every(k => other.summaries.hasOwnProperty(k))) {
            return false;
        }
        if (!Object.keys(other.summaries).every(k => this.summaries.hasOwnProperty(k))) {
            return false;
        }
        for (const { assetType, summary } of this.all()) {
            if (!summary.sum.isEqualTo(other.get(assetType).sum)) {
                return false;
            }
        }
        return true;
    }

    static summerize<T extends { assetType: H160; quantity: U64 }>(
        assetLikes: T[],
    ): AssetSummarization<T> {
        return AssetSummarization.summerizeBy(assetLikes, x => x);
    }

    static summerizeBy<T>(
        assetLikes: T[],
        extract: (value: T) => { assetType: H160; quantity: U64 },
    ): AssetSummarization<T> {
        const result: { [assetType: string]: { sum: U64; values: T[] } } = {};
        for (const assetLike of assetLikes) {
            const asset = extract(assetLike);
            if (asset.quantity.isEqualTo(0)) {
                continue;
            }
            const assetType = asset.assetType.value;
            if (result.hasOwnProperty(assetType)) {
                result[assetType].sum = result[assetType].sum.plus(asset.quantity);
                result[assetType].values.push(assetLike);
            } else {
                result[assetType] = {
                    sum: asset.quantity,
                    values: [assetLike],
                };
            }
        }
        for (const summary of Object.values(result)) {
            summary.values = summary.values.sort((a, b) => {
                const quantityA = extract(a).quantity;
                const quantityB = extract(b).quantity;
                if (quantityA.isGreaterThan(quantityB)) {
                    return -1;
                } else if (quantityB.isGreaterThan(quantityA)) {
                    return 1;
                } else {
                    return 0;
                }
            });
        }
        return new AssetSummarization(result);
    }
}

export function sleep(seconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

export function time<U>(tag: string, func: () => U): U {
    const start = Date.now();
    const result = func();
    if (result instanceof Promise) {
        return result.then(value => {
            const end = Date.now();
            console.log("time", tag, (end - start).toString());
            return value;
        }) as any;
    } else {
        const end = Date.now();
        console.log("time", tag, (end - start).toString());
        return result;
    }
}

export function makeRandomString(length: number) {
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let text = "";
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }

    return text;
}
