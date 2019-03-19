import { SDK } from "codechain-sdk";
import { TransferAsset } from "codechain-sdk/lib/core/classes";
import { Order } from "codechain-sdk/lib/core/transaction/Order";
import { AssetManager } from "./AssetManager";

export class AssetTransferTxGenerator {
    private sdk: SDK;
    private assetManager: AssetManager;
    private commonDivisors: number[];

    constructor(sdk: SDK, assetManager: AssetManager) {
        this.sdk = sdk;
        this.assetManager = assetManager;
        this.commonDivisors = [1, 2, 4, 5, 10, 20, 25, 50, 100];
    }

    public generateAssetTransferTx(
        indexes: {
            idxFrom: number;
            idxTo: number;
        },
        order: Order
    ): TransferAsset {
        const { idxFrom, idxTo } = indexes;
        const assets = this.assetManager.wallets;
        const fromInput = assets[idxFrom].asset.createTransferInput();
        const toInput = assets[idxTo].asset.createTransferInput();

        const randomQuantityMultiplier = Math.floor(
            Math.random() * (this.commonDivisors.length + 1)
        );
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

        return this.sdk.core
            .createTransferAssetTransaction()
            .addInputs(fromInput, toInput)
            .addOutputs(consistentOutputs)
            .addOrder({
                order,
                spentQuantity: spentFrom,
                inputIndices: [0],
                outputIndices: [0, 1]
            });
    }
}
