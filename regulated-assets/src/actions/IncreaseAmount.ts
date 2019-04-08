import {
    AssetAddress,
    H160,
    PlatformAddress,
    U64,
    U64Value,
} from "codechain-primitives";

import { IncreaseAssetSupply } from "codechain-sdk/lib/core/transaction/IncreaseAssetSupply";
import { sdk } from "../configs";
import { State, Utxo } from "../State";
import { createApprovedTx } from "../util";
import { Action, approvedByRegistrar } from "./Action";

export class IncreaseSupply extends Action<IncreaseAssetSupply> {
    public static async create(params: {
        sender: PlatformAddress;
        receiver: H160;
        approvers?: PlatformAddress[];
        assetType: H160;
        supplyValue: U64Value;
    }): Promise<IncreaseSupply> {
        const supply = U64.ensure(params.supplyValue);
        const recipient = AssetAddress.fromTypeAndPayload(1, params.receiver, {
            networkId: sdk.networkId,
        });
        const tx = await createApprovedTx({
            approvers: params.approvers || [],
            tx: sdk.core.createIncreaseAssetSupplyTransaction({
                assetType: params.assetType,
                shardId: 0,
                recipient,
                supply,
            }),
        });

        return new IncreaseSupply({
            sender: params.sender,
            receiver: params.receiver,
            approvers: params.approvers || [],
            assetType: params.assetType,
            supply,
            tx,
        });
    }
    public readonly receiver: H160;
    public readonly approvers: PlatformAddress[];
    public readonly assetType: H160;
    public readonly supply: U64;

    private constructor(params: {
        sender: PlatformAddress;
        receiver: H160;
        approvers: PlatformAddress[];
        assetType: H160;
        supply: U64;
        tx: IncreaseAssetSupply;
    }) {
        super({
            tag: "IncreaseAssetSupply",
            sender: params.sender,
            tx: params.tx,
        });
        this.receiver = params.receiver;
        this.approvers = params.approvers;
        this.assetType = params.assetType;
        this.supply = params.supply;
    }

    public valid(state: State): boolean {
        if (!approvedByRegistrar(state, this.assetType, this.sender, this.approvers)) {
            return false;
        }

        const assetScheme = state.getAssetScheme(this.assetType);
        const headroom = U64.MAX_VALUE.minus(assetScheme.supply);
        if (headroom.isLessThan(this.supply)) {
            return false;
        }

        return true;
    }

    protected apply(state: State) {
        super.apply(state);
        state.getUtxos(this.receiver).push(new Utxo(this.receiver, this.tx.getMintedAsset()));
        const assetScheme = state.getAssetScheme(this.assetType) as {
            supply: U64;
        };
        console.log(
            `increase ${this.assetType} ${assetScheme.supply.toString(10)}` +
                ` => ${assetScheme.supply.plus(this.supply)}`,
        );
        assetScheme.supply = assetScheme.supply.plus(this.supply);
    }
}
