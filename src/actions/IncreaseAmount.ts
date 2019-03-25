import {AssetTransferAddress, H160, PlatformAddress, U64, U64Value} from "codechain-primitives/lib";

import {Action, isApprovedByAssetRegistrar} from "./Action";
import {State} from "../State";
import {sdk} from "../configs";
import {createApprovedTx} from "../util";
import {IncreaseAssetSupply} from "codechain-sdk/lib/core/transaction/IncreaseAssetSupply";

export class IncreaseSupply extends Action<IncreaseAssetSupply> {
    readonly approvers: PlatformAddress[];
    readonly assetType: H160;
    readonly supply: U64;

    private constructor(params: {
        sender: PlatformAddress,
        receiver: PlatformAddress,
        approvers: PlatformAddress[],
        assetType: H160,
        supply: U64
        tx: IncreaseAssetSupply,
    }) {
        super({
            tag: "IncreaseAssetSupply",
            sender: params.sender,
            tx: params.tx,
        });
        this.approvers = params.approvers;
        this.assetType = params.assetType;
        this.supply = params.supply;
    }

    static async create(params: {
        sender: PlatformAddress,
        receiver: PlatformAddress,
        approvers?: PlatformAddress[],
        assetType: H160,
        supplyValue: U64Value,
    }): Promise<IncreaseSupply> {
        const supply = U64.ensure(params.supplyValue);
        const recipient = AssetTransferAddress.fromTypeAndPayload(1, params.receiver.accountId, {networkId: sdk.networkId});
        const tx = await createApprovedTx({
            approvers: params.approvers || [],
            tx: sdk.core.createIncreaseAssetSupplyTransaction({
                assetType: params.assetType,
                shardId: 0,
                recipient,
                supply
            })
        });

        return new IncreaseSupply({
            sender: params.sender,
            receiver: params.receiver,
            approvers: params.approvers || [],
            assetType: params.assetType,
            supply,
            tx
        })
    }

    protected apply(state: State) {
        super.apply(state);
        const assetScheme = state.getAssetScheme(this.assetType) as { supply: U64};
        console.log(`increase ${this.assetType} ${assetScheme.supply.toString(10)} => ${assetScheme.supply.plus(this.supply)}`);
        assetScheme.supply = assetScheme.supply.plus(this.supply);
    }

    valid(state: State): boolean {
        if (!isApprovedByAssetRegistrar(state, this.assetType, this.sender, this.approvers)) {
            return false;
        }

        const assetScheme = state.getAssetScheme(this.assetType);
        const headroom = U64.MAX_VALUE.minus(assetScheme.supply);
        if (headroom.isLessThan(this.supply)) {
            return false;
        }

        return true;
    }
}