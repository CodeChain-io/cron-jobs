import {AssetScheme, AssetTransferInput, AssetTransferOutput, TransferAsset} from "codechain-sdk/lib/core/classes";
import {AssetTransferAddress, H160, PlatformAddress, U64, U64Value} from "codechain-primitives/lib";

import {Action, isApprovedByAssetRegistrar} from "./Action";
import {State, Utxo} from "../State";
import {localKeyStore, sdk} from "../configs";
import {assert, createApprovedTx} from "../util";

export type TransferOutput = {
    receiver: PlatformAddress,
    type: "burn" | "p2pkh",
    assetType: H160,
    quantity: U64Value,
};

export class Transfer extends Action<TransferAsset> {
    readonly approvers: PlatformAddress[];
    readonly inputs: Utxo[];
    readonly burns: Utxo[];
    readonly outputs: TransferOutput[];

    private constructor(params: {
        sender: PlatformAddress,
        approvers: PlatformAddress[],
        inputs: Utxo[],
        burns: Utxo[],
        outputs: TransferOutput[],
        tx: TransferAsset,
    }) {
        super({
            tag: `Transfer`,
            sender: params.sender,
            tx: params.tx
        });
        this.approvers = params.approvers;
        this.inputs = params.inputs;
        this.burns = params.burns;
        this.outputs = params.outputs;
    }

    static async create(params: {
        sender: PlatformAddress,
        approvers?: PlatformAddress[],
        inputs?: Utxo[],
        burns?: Utxo[],
        outputs?: TransferOutput[],
    }): Promise<Transfer> {
        const keyStore = await localKeyStore;
        const tx = await createApprovedTx({
            approvers: params.approvers || [],
            tx: sdk.core.createTransferAssetTransaction({
                burns: (params.burns || []).map(utxo => utxo.asset.createTransferInput()),
                inputs: (params.inputs || []).map(utxo => utxo.asset.createTransferInput()),
                outputs: (params.outputs || []).map(output => sdk.core.createAssetTransferOutput({
                    recipient: AssetTransferAddress.fromTypeAndPayload(output.type == "p2pkh" ? 1 : 2, output.receiver.accountId, { networkId: sdk.networkId }),
                    shardId: 0,
                    assetType: output.assetType,
                    quantity: U64.ensure(output.quantity),
                })),
            }),
        });

        return new Transfer({
            sender: params.sender,
            approvers: params.approvers || [],
            inputs: params.inputs || [],
            burns: params.burns || [],
            outputs: params.outputs || [],
            tx,
        });
    }

    protected apply(state: State) {
        super.apply(state);
        for (const burn of this.burns) {
            const index = state.getUtxos(burn.owner).indexOf(burn);
            state.getUtxos(burn.owner).splice(index, 1);

            const assetScheme = state.getAssetScheme(burn.asset.assetType);
            const newSupply = assetScheme.supply.minus(burn.asset.quantity);
            state.setAssetScheme(burn.asset.assetType, AssetScheme.fromJSON({
                ...assetScheme.toJSON(),
                supply: newSupply.toJSON(),
            }));
            console.log(`burn ${burn.owner.value} ${burn.asset.assetType.value} ${burn.asset.quantity.toString(10)}`);
        }
        for (const input of this.inputs) {
            const index = state.getUtxos(input.owner).indexOf(input);
            state.getUtxos(input.owner).splice(index, 1);
            console.log(`input ${input.owner.value} ${input.asset.assetType.value} ${input.asset.quantity.toString(10)}`);
        }
        for (let i=0; i<this.outputs.length; i++) {
            const output = this.outputs[i];
            const asset = this.tx.getTransferredAsset(i);
            state.getUtxos(output.receiver).push(new Utxo(output.receiver, asset));
            console.log(`output ${output.receiver.value} ${output.assetType.value} ${output.type} ${output.quantity.toString(10)}`)
        }
    }

    valid(state: State): boolean {
        // check permission
        for (const input of this.inputs.concat(this.burns)) {
            // actually owns it
            assert(() => state.getUtxos(input.owner).indexOf(input) >= 0);
            // this is approved.
            const approved = isApprovedByAssetRegistrar(state, input.asset.assetType, this.sender, this.approvers);
            if (!approved) {
                return false;
            }
        }

        // check input and output is balanced.
        function summarize(quantities: {assetType: H160, quantity: U64Value}[]): {[assetType: string]: U64} {
            const result: {[assetType: string]: U64} = {};
            for (const {assetType, quantity} of quantities) {
                const key = assetType.value;
                if (result.hasOwnProperty(key)) {
                    result[key] = result[key].plus(quantity);
                } else {
                    result[key] = U64.ensure(quantity);
                }
            }
            return result;
        }
        const inputSummary = summarize(this.inputs.map(utxo => utxo.asset));
        const outputSummary = summarize(this.outputs);

        for(const key of Object.keys(inputSummary)) {
            if (!outputSummary.hasOwnProperty(key)) {
                return false;
            }
        }
        for(const key of Object.keys(outputSummary)) {
            if (!inputSummary.hasOwnProperty(key)) {
                return false;
            }
            if (!inputSummary[key].isEqualTo(outputSummary[key])) {
                return false;
            }
        }

        // enough supplies
        const burnSummary = summarize(this.burns.map(utxo => utxo.asset));
        for (const assetType of Object.keys(burnSummary)) {
            const assetScheme = state.getAssetScheme(assetType);
            if (assetScheme.supply.isLessThan(burnSummary[assetType])) {
                return false;
            }
        }

        return true;
    }
}