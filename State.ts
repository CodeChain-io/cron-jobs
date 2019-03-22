import {
    AssetTransferAddress,
    H160,
    H160Value,
    PlatformAddress,
    PlatformAddressValue,
    U64,
    U64Value
} from "codechain-primitives/lib";
import {Asset, AssetScheme} from "codechain-sdk/lib/core/classes";
import * as request from "request-promise-native";

import {INDEXER_URL, REGULATOR, sdk} from "./configs";
import {CreateAsset} from "./actions/CreateAsset";
import {assert} from "./util";

export class Utxo {
    owner: PlatformAddress;
    asset: Asset;

    constructor(owner: PlatformAddress, asset: Asset) {
        this.owner = owner;
        this.asset = asset;
    }
}

export class State {
    private balances: { [account: string]: U64 };
    private utxos: { [account: string]: Utxo[] };
    private seqs: { [account: string]: number };
    private assetSchemes: { [assetType: string]: AssetScheme };

    constructor() {
        this.balances = {};
        this.utxos = {};
        this.seqs = {};
        this.assetSchemes = {};
    }

    async recover(addresses: PlatformAddress[], assetSchemes?: AssetScheme[]) {
        console.log("state recovey");

        const cccs = await Promise.all(addresses.map(address => sdk.rpc.chain.getBalance(address)));
        const seqs = await Promise.all(addresses.map(address => sdk.rpc.chain.getSeq(address)));

        for (const assetScheme of assetSchemes || []) {
            const assetType = new CreateAsset({
                regulator: REGULATOR,
                assetScheme
            }).tx.getAssetType();
            const currentAssetScheme = await sdk.rpc.chain.getAssetSchemeByType(assetType, 0);
            if (!currentAssetScheme) {
                continue;
            }
            this.assetSchemes[assetType.value] = currentAssetScheme;
            console.log(currentAssetScheme.toJSON());
        }

        for (let i = 0; i < addresses.length; i++) {
            const address = addresses[i];

            this.modifyBalance(address, () => cccs[i]);
            console.log(`balance ${address}: ${this.getBalance(address).toString(10)}`);

            this.setSeq(address, seqs[i]);
            console.log(`seq ${address}: ${this.getSeq(address)}`);

            this.utxos[address.value] = [];
            for (const assetType in this.assetSchemes) {
                type UtxoAttribute = {
                    id?: string;
                    address: string;
                    assetType: string;
                    shardId: number;
                    lockScriptHash: string;
                    parameters: string[];
                    quantity: string;
                    orderHash?: string | null;
                    transactionHash: string;
                    transactionTracker: string;
                    transactionOutputIndex: number;
                };
                const assetAddress = AssetTransferAddress.fromTypeAndPayload(1, address.accountId, {networkId: sdk.networkId});
                const utxoResponse: UtxoAttribute[] = await request({
                    url: `${INDEXER_URL}/api/utxo?address=${assetAddress.value}&assetType=${assetType}`,
                    json: true
                });
                const utxos = utxoResponse.map(utxo => {
                    const asset = Asset.fromJSON({
                        assetType: utxo.assetType,
                        lockScriptHash: utxo.lockScriptHash,
                        parameters: utxo.parameters,
                        quantity: utxo.quantity,
                        orderHash: utxo.orderHash || null,
                        shardId: utxo.shardId,
                        tracker: utxo.transactionTracker,
                        transactionOutputIndex: utxo.transactionOutputIndex,
                    });
                    return new Utxo(address, asset);
                });
                this.utxos[address.value].push(...utxos);

                console.log(`asset type ${assetType}: `);
                for (const utxo of utxos) {
                    console.log(`    ${utxo.asset.toJSON()}`)
                }
            }
        }
    }

    getBalance(addressValue: PlatformAddressValue): U64 {
        const address = PlatformAddress.ensure(addressValue);
        if (this.balances.hasOwnProperty(address.value)) {
            return this.balances[address.value]
        } else {
            return new U64(0)
        }
    }

    setBalance(addressValue: PlatformAddressValue, value: U64Value) {
        const address = PlatformAddress.ensure(addressValue);
        this.balances[address.value] = U64.ensure(value);
    }

    modifyBalance(addressValue: PlatformAddressValue, callback: ((balance: U64) => U64Value)): U64 {
        const existing = this.getBalance(addressValue);
        const result = U64.ensure(callback(existing));
        this.setBalance(addressValue, result);
        return existing;
    }

    getUtxos(addressValue: PlatformAddressValue): Utxo[] {
        const address = PlatformAddress.ensure(addressValue);
        if (this.utxos.hasOwnProperty(address.value)) {
            return this.utxos[address.value]
        } else {
            const utxos: Utxo[] = [];
            this.utxos[address.value] = utxos;
            return utxos;
        }
    }

    printUtxos(...addressValues: PlatformAddressValue[]) {
        for (const addressValue of addressValues) {
            const utxos = this.getUtxos(addressValue).map(utxo => utxo.asset);
            if (utxos.length == 0) {
                continue;
            }
            const assetsQuantities: { [assetType: string]: [U64] } = {};
            for (const utxo of utxos) {
                if (assetsQuantities.hasOwnProperty(utxo.assetType.value)) {
                    assetsQuantities[utxo.assetType.value].push(utxo.quantity);
                } else {
                    assetsQuantities[utxo.assetType.value] = [utxo.quantity];
                }
            }
            console.log(`utxo for ${PlatformAddress.ensure(addressValue).value}`);
            for (const assetType of Object.keys(assetsQuantities).sort()) {
                function compareU64(a: U64, b: U64): number {
                    if (a.isGreaterThan(b)) {
                        return -1;
                    } else if (b.isGreaterThan(a)) {
                        return 1;
                    } else {
                        return 0;
                    }
                }

                const quantities = assetsQuantities[assetType].sort(compareU64).map(quantity => quantity.toString(10)).join(", ");
                console.log(`  utxo ${assetType}: [${quantities}]`);
            }
        }
    }

    hasAssetScheme(assetTypeValue: H160Value): boolean {
        const assetType = H160.ensure(assetTypeValue);
        return this.assetSchemes.hasOwnProperty(assetType.value);
    }

    getAssetScheme(assetTypeValue: H160Value): AssetScheme {
        const assetType = H160.ensure(assetTypeValue);
        return this.assetSchemes[assetType.value];
    }

    setAssetScheme(assetTypeValue: H160Value, assetScheme: AssetScheme) {
        const assetType = H160.ensure(assetTypeValue);
        assert(() => !this.hasAssetScheme(assetType));
        this.assetSchemes[assetType.value] = assetScheme;
    }

    private setSeq(addressValue: PlatformAddressValue, seq: number) {
        this.seqs[PlatformAddress.ensure(addressValue).value] = seq;
    }

    getSeq(addressValue: PlatformAddressValue): number {
        return this.seqs[PlatformAddress.ensure(addressValue).value]
    }

    nextSeq(addressValue: PlatformAddressValue): number {
        return this.seqs[PlatformAddress.ensure(addressValue).value]++;
    }
}