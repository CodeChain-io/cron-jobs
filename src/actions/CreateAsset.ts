import { AssetTransferAddress, H160, PlatformAddress } from "codechain-primitives/lib";
import { AssetScheme, MintAsset } from "codechain-sdk/lib/core/classes";

import { sdk } from "../configs";
import { State, Utxo } from "../State";
import { Action } from "./Action";

export class CreateAsset extends Action<MintAsset> {
    public readonly regulator: PlatformAddress;
    public readonly recipient: H160;
    public readonly assetScheme: AssetScheme;

    public constructor(params: {
        regulator: PlatformAddress;
        recipient: H160;
        assetScheme: AssetScheme;
    }) {
        super({
            tag: "CreateAsset",
            sender: params.regulator,
            tx: params.assetScheme.createMintTransaction({
                recipient: AssetTransferAddress.fromTypeAndPayload(1, params.recipient, {
                    networkId: sdk.networkId,
                }),
            }),
        });
        this.regulator = params.regulator;
        this.recipient = params.recipient;
        this.assetScheme = params.assetScheme;
    }

    public apply(state: State) {
        super.apply(state);
        state.getUtxos(this.recipient).push(new Utxo(this.recipient, this.tx.getMintedAsset()));
        state.setAssetScheme(this.tx.getAssetType(), this.tx.getAssetScheme());

        const name = JSON.parse(this.assetScheme.metadata).name;
        const assetType = this.tx.getAssetType();
        console.log(`create ${name} ${assetType.value} ${this.assetScheme.supply.toString(10)}`);
    }

    public valid(state: State): boolean {
        return state.hasAssetScheme(this.tx.getAssetType()) === false;
    }
}
