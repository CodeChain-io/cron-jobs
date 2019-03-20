import { TransferAsset } from "codechain-sdk/lib/core/classes";
import { Order } from "codechain-sdk/lib/core/transaction/Order";
import { AssetManager } from "./AssetManager";
import Helper from "./util";

export class AssetTransferTxGenerator {
    private helper: Helper;
    private assetManager: AssetManager;
    private commonDivisors: number[];

    constructor(helper: Helper, assetManager: AssetManager) {
        this.helper = helper;
        this.assetManager = assetManager;
        this.commonDivisors = [1, 2, 4, 5, 10, 20, 25, 50];
    }

    public generateAssetTransferTx(
        indices: {
            idxFrom: number;
            idxTo: number;
            idxFee?: number;
        },
        order: Order,
        dualOrder?: Order
    ): TransferAsset {
        const { idxFrom, idxTo, idxFee } = indices;
        const assets = this.assetManager.wallets;
        const fromInput = assets[idxFrom].asset.createTransferInput();
        const toInput = assets[idxTo].asset.createTransferInput();

        const randomQuantityMultiplier = this.commonDivisors[
            Math.floor(Math.random() * this.commonDivisors.length)
        ];
        const baseQuantityFrom = order.assetQuantityFrom.idiv(100);
        const baseQuantityTo = order.assetQuantityTo.idiv(100);

        const spentFrom = baseQuantityFrom.times(randomQuantityMultiplier);
        const receivedTo = baseQuantityTo.times(randomQuantityMultiplier);

        const assetTypeFrom = assets[idxFrom].asset.assetType;
        const assetTypeTo = assets[idxTo].asset.assetType;

        const consistentOutputs = [];
        consistentOutputs.push(
            {
                recipient: assets[idxFrom].owner,
                quantity: fromInput.prevOut.quantity.minus(spentFrom),
                assetType: assetTypeFrom,
                shardId: 0
            },
            {
                recipient: assets[idxFrom].owner,
                quantity: receivedTo,
                assetType: assetTypeTo,
                shardId: 0
            },
            {
                recipient: assets[idxTo].owner,
                quantity: spentFrom,
                assetType: assetTypeFrom,
                shardId: 0
            },
            {
                recipient: assets[idxTo].owner,
                quantity: toInput.prevOut.quantity.minus(receivedTo),
                assetType: assetTypeTo,
                shardId: 0
            }
        );

        const result = this.helper.sdk.core
            .createTransferAssetTransaction()
            .addInputs(fromInput, toInput)
            .addOutputs(consistentOutputs)
            .addOrder({
                order,
                spentQuantity: spentFrom,
                inputIndices: idxFee ? [0, 2] : [0],
                outputIndices: idxFee ? [0, 1, 4, 5] : [0, 1]
            });

        if (dualOrder) {
            result.addOrder({
                order: dualOrder,
                spentQuantity: receivedTo,
                inputIndices: [1],
                outputIndices: [2, 3]
            });
        }

        if (idxFee) {
            const feeInput = assets[idxFrom].feeAsset.createTransferInput();
            const baseQuantityFee = order.assetQuantityFee.idiv(100);
            const feeTotal = baseQuantityFee.times(randomQuantityMultiplier);
            const assetTypeFee = assets[idxFrom].feeAsset.assetType;
            result.addInputs(feeInput);
            result.addOutputs(
                {
                    recipient: assets[idxFrom].owner,
                    quantity: feeInput.prevOut.quantity.minus(feeTotal),
                    assetType: assetTypeFee,
                    shardId: 0
                },
                {
                    recipient: assets[idxFee].owner,
                    quantity: feeTotal,
                    assetType: assetTypeFee,
                    shardId: 0
                }
            );
        }

        return result;
    }
}
