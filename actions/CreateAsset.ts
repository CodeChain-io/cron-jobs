import {AssetScheme, MintAsset} from "codechain-sdk/lib/core/classes";
import {AssetTransferAddress, PlatformAddress} from "codechain-primitives/lib";

import {Action} from "./Action";
import {sdk} from "../configs";
import {State, Utxo} from "../State";

export class CreateAsset extends Action<MintAsset> {
    readonly regulator: PlatformAddress;
    readonly assetScheme: AssetScheme;

    constructor(params: {
        regulator: PlatformAddress,
        assetScheme: AssetScheme
    }) {
        super({
            tag: "CreateAsset",
            sender: params.regulator,
            tx: params.assetScheme.createMintTransaction({
                recipient: AssetTransferAddress.fromTypeAndPayload(1, params.regulator.accountId, {networkId: sdk.networkId})
            })
        });
        this.regulator = params.regulator;
        this.assetScheme = params.assetScheme;
    }

    apply(state: State) {
        super.apply(state);
        state.getUtxos(this.regulator).push(new Utxo(this.regulator, this.tx.getMintedAsset()));
        state.setAssetScheme(this.tx.getAssetType(), this.tx.getAssetScheme());

        const name = JSON.parse(this.assetScheme.metadata).name;
        const assetType = this.tx.getAssetType();
        console.log(`create ${name} ${assetType.value} ${this.assetScheme.supply.toString(10)}`);
    }

    valid(state: State): boolean {
        return state.hasAssetScheme(this.tx.getAssetType()) == false;
    }
}