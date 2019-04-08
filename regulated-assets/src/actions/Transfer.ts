import { AssetAddress, H160, PlatformAddress, U64, U64Value } from "codechain-primitives";
import { AssetScheme, TransferAsset } from "codechain-sdk/lib/core/classes";

import { sdk } from "../configs";
import { State, Utxo } from "../State";
import { assert, createApprovedTx, AssetSummarization } from "../util";
import { Action, havePermission } from "./Action";
import { P2PKHBurn } from "codechain-sdk/lib/key/P2PKHBurn";
import { P2PKH } from "codechain-sdk/lib/key/P2PKH";

export interface TransferOutput {
    receiver: H160;
    type: "P2PKHBurn" | "P2PKH";
    assetType: H160;
    quantity: U64Value;
}

export class Transfer extends Action<TransferAsset> {
    public static async create(params: {
        sender: PlatformAddress;
        approvers?: PlatformAddress[];
        inputs?: Utxo[];
        burns?: Utxo[];
        outputs?: TransferOutput[];
    }): Promise<Transfer> {
        const unsignedTx = sdk.core.createTransferAssetTransaction({
            burns: (params.burns || []).map(utxo => utxo.asset.createTransferInput()),
            inputs: (params.inputs || []).map(utxo => utxo.asset.createTransferInput()),
            outputs: (params.outputs || []).map(output =>
                sdk.core.createAssetTransferOutput({
                    recipient: AssetAddress.fromTypeAndPayload(
                        output.type === "P2PKH" ? 1 : 2,
                        output.receiver,
                        { networkId: sdk.networkId },
                    ),
                    shardId: 0,
                    assetType: output.assetType,
                    quantity: U64.ensure(output.quantity),
                }),
            ),
        });
        for (let i = 0; i < unsignedTx.inputs().length; i++) {
            await sdk.key.signTransactionInput(unsignedTx, i);
        }
        for (let i = 0; i < unsignedTx.burns().length; i++) {
            await sdk.key.signTransactionBurn(unsignedTx, i);
        }
        const tx = await createApprovedTx({
            approvers: params.approvers || [],
            tx: unsignedTx,
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
    public readonly approvers: PlatformAddress[];
    public readonly inputs: Utxo[];
    public readonly burns: Utxo[];
    public readonly outputs: TransferOutput[];

    private constructor(params: {
        sender: PlatformAddress;
        approvers: PlatformAddress[];
        inputs: Utxo[];
        burns: Utxo[];
        outputs: TransferOutput[];
        tx: TransferAsset;
    }) {
        super({
            tag: `Transfer`,
            sender: params.sender,
            tx: params.tx,
        });
        this.approvers = params.approvers;
        this.inputs = params.inputs;
        this.burns = params.burns;
        this.outputs = params.outputs;
    }

    public valid(state: State): boolean {
        // check permission
        for (const input of this.inputs.concat(this.burns)) {
            // actually owns it
            assert(() => state.getUtxos(input.owner).indexOf(input) >= 0);
            if (!havePermission(state, input.asset.assetType, this.sender, this.approvers)) {
                return false;
            }
        }

        for (const burn of this.burns) {
            if (!burn.asset.lockScriptHash.isEqualTo(P2PKHBurn.getLockScriptHash())) {
                return false;
            }
        }
        for (const input of this.inputs) {
            if (!input.asset.lockScriptHash.isEqualTo(P2PKH.getLockScriptHash())) {
                return false;
            }
        }

        // check input and output is balanced.
        const inputSummary = AssetSummarization.summerizeBy(this.inputs, utxo => utxo.asset);
        const outputSummary = AssetSummarization.summerizeBy(this.outputs, utxo => {
            return {
                assetType: utxo.assetType,
                quantity: U64.ensure(utxo.quantity),
            };
        });
        if (!inputSummary.isEquivalentTo(outputSummary)) {
            return false;
        }

        // enough supplies
        const burnSummary = AssetSummarization.summerizeBy(this.burns, utxo => utxo.asset);
        for (const assetType of burnSummary.assetTypes()) {
            const assetScheme = state.getAssetScheme(assetType);
            if (assetScheme.supply.isLessThan(burnSummary.get(assetType).sum)) {
                return false;
            }
        }

        return true;
    }

    protected apply(state: State) {
        super.apply(state);
        for (const burn of this.burns) {
            const index = state.getUtxos(burn.owner).indexOf(burn);
            state.getUtxos(burn.owner).splice(index, 1);

            const assetScheme = state.getAssetScheme(burn.asset.assetType);
            const newSupply = assetScheme.supply.minus(burn.asset.quantity);
            state.setAssetScheme(
                burn.asset.assetType,
                AssetScheme.fromJSON({
                    ...assetScheme.toJSON(),
                    supply: newSupply.toJSON(),
                }),
            );
            console.log(
                `burn ${burn.owner.value} ${
                    burn.asset.assetType.value
                } ${burn.asset.quantity.toString(10)}`,
            );
        }
        for (const input of this.inputs) {
            const index = state.getUtxos(input.owner).indexOf(input);
            state.getUtxos(input.owner).splice(index, 1);
            console.log(
                `input ${input.owner.value} ${
                    input.asset.assetType.value
                } ${input.asset.quantity.toString(10)}`,
            );
        }
        for (let i = 0; i < this.outputs.length; i++) {
            const output = this.outputs[i];
            const asset = this.tx.getTransferredAsset(i);
            state.getUtxos(output.receiver).push(new Utxo(output.receiver, asset));
            console.log(
                `output ${output.receiver.value} ${output.assetType.value} ${
                    output.type
                } ${output.quantity.toString(10)}`,
            );
        }
    }
}
