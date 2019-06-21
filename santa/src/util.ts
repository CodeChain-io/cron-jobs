import { SDK } from "codechain-sdk";
import { Asset } from "codechain-sdk/lib/core/Asset";
import {
    AssetAddress,
    H256,
    PlatformAddress,
    Transaction,
    U64
} from "codechain-sdk/lib/core/classes";
import { AssetTransaction } from "codechain-sdk/lib/core/Transaction";
import { TransferAsset } from "codechain-sdk/lib/core/transaction/TransferAsset";
import { KeyStore } from "codechain-sdk/lib/key/KeyStore";
import * as config from "config";

// On Corgi
// secret 090b235e9eb8f197f2dd927937222c570396d971222d9009a9189e2b6cc0a2c1
// faucetAddress wccq8y2fax3d4lresherumwd3adjcry4wwydqqrhaxp
// On Local
// secret ede1d4ccb4ec9a8bbbae9a13db3f4a7b56ea04189be86ac3a6a439d9a0a1addd
// faucetAddress tccq9h7vnl68frvqapzv3tujrxtxtwqdnxw6yamrrgd

export default class Helper {
    private readonly keyStore: KeyStore;
    private readonly _sdk: SDK;
    private readonly faucetSecret: string;
    private readonly faucetAddress: string;
    private regularSecret?: string;

    public get sdk() {
        return this._sdk;
    }

    constructor(sdk: SDK, keyStore: KeyStore) {
        this._sdk = sdk;
        this.keyStore = keyStore;
        this.faucetSecret = getConfig<string>("faucet_secret");
        this.faucetAddress = getConfig<string>("faucet_address");
        this.regularSecret = undefined;
    }

    public async setRegularKey() {
        console.log("New Regular key is now registered.");
        this.regularSecret = SDK.util.generatePrivateKey();
        const regularPublic = SDK.util.getPublicFromPrivate(this.regularSecret);

        const setRegularKeyTx = this.sdk.core.createSetRegularKeyTransaction({
            key: regularPublic
        });
        const seq = await this.sdk.rpc.chain.getSeq(this.faucetAddress);
        const hash = await this.sdk.rpc.chain.sendSignedTransaction(
            setRegularKeyTx.sign({
                secret: this.faucetSecret,
                seq,
                fee: 10000
            })
        );

        while (!(await this.sdk.rpc.chain.containsTransaction(hash))) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    public createP2PKHAddress() {
        const p2pkh = this.sdk.key.createP2PKH({ keyStore: this.keyStore });
        return p2pkh.createAddress();
    }

    public async sendTransaction(
        tx: Transaction,
        params: {
            account: string | PlatformAddress;
            fee?: number | string | U64;
            seq?: number;
        }
    ): Promise<H256> {
        const { account, fee = 100000 } = params;
        const { seq = await this.sdk.rpc.chain.getSeq(account) } = params;
        const signed = await this.sdk.key.signTransaction(tx, {
            keyStore: this.keyStore,
            account,
            fee,
            seq
        });
        return this.sdk.rpc.chain.sendSignedTransaction(signed);
    }

    public async sendAssetTransaction(
        tx: AssetTransaction & Transaction,
        options?: {
            seq?: number;
            fee?: number;
            awaitResult?: boolean;
            secret?: string;
        }
    ): Promise<boolean | null> {
        const {
            seq = (await this.sdk.rpc.chain.getSeq(this.faucetAddress)) || 0,
            fee = 100,
            awaitResult = true,
            secret = this.regularSecret || this.faucetSecret
        } = options || {};
        const signed = tx.sign({
            secret,
            fee,
            seq
        });
        await this.sdk.rpc.chain.sendSignedTransaction(signed);
        if (awaitResult) {
            let cnt = 0;
            while (
                !(await this.sdk.rpc.chain.containsTransaction(
                    signed.hash()
                )) &&
                cnt < 300
            ) {
                cnt++;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            return cnt < 300;
        } else {
            return null;
        }
    }

    public async mintAsset(params: {
        supply: U64 | number;
        recipient?: string | AssetAddress;
        secret?: string;
        seq?: number;
        metadata?: string;
    }): Promise<Asset> {
        const {
            supply,
            seq,
            recipient = await this.createP2PKHAddress(),
            secret,
            metadata = ""
        } = params;
        const tx = this.sdk.core.createMintAssetTransaction({
            scheme: {
                shardId: 0,
                metadata,
                supply
            },
            recipient
        });
        const awaitMint = true;
        await this.sendAssetTransaction(tx, {
            secret,
            seq,
            fee: 100000
        });

        if (!awaitMint) {
            return tx.getMintedAsset();
        }
        const asset = await this.sdk.rpc.chain.getAsset(tx.tracker(), 0, 0);
        if (asset === null) {
            throw Error(`Failed to mint asset`);
        }
        return asset;
    }

    public async signTransactionInput(tx: TransferAsset, index: number) {
        await this.sdk.key.signTransactionInput(tx, index, {
            keyStore: this.keyStore
        });
    }
}

export function getConfig<T>(field: string): T {
    const c = config.get<T>(field);
    if (c == null) {
        throw new Error(`${field} is not specified`);
    }
    return c;
}

export function haveConfig(field: string): boolean {
    return !!config.has(field) && config.get(field) != null;
}

export function randRange(min: number, max: number) {
    return Math.floor(min + Math.random() * (max + 1 - min));
}

export function asyncSleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function getDivisors(n: U64) {
    if (n.lt(1)) {
        throw new Error("Argument error");
    }
    const small = [];
    const large = [];
    const end = Math.floor(Math.sqrt(n.value.toNumber()));
    for (let i = 1; i <= end; i++) {
        if (n.mod(i).eq(0)) {
            small.push(new U64(i));
            if (!n.eq(i * i)) {
                // Don't include a square root twice
                large.push(n.idiv(i));
            }
        }
    }
    large.reverse();
    return small.concat(large);
}

export function gcd(a: U64, b: U64): U64 {
    if (a.eq(0)) {
        return b;
    }
    return gcd(b.mod(a), a);
}
