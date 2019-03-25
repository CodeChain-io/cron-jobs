import { TransferAsset, U64 } from "codechain-sdk/lib/core/classes";
import { Order } from "codechain-sdk/lib/core/transaction/Order";
import { AssetManager } from "./AssetManager";
import Helper, { gcd, getDivisors, randRange } from "./util";

export class AssetTransferTxGenerator {
    private helper: Helper;
    private assetManager: AssetManager;

    constructor(helper: Helper, assetManager: AssetManager) {
        this.helper = helper;
        this.assetManager = assetManager;
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

        const gcdFromAndToAndFee = gcd(
            gcd(order.assetQuantityFrom, order.assetQuantityTo),
            order.assetQuantityFee
        );

        const commonDivisors = getDivisors(gcdFromAndToAndFee);

        const randomQuantityMultiplier =
            commonDivisors[randRange(0, commonDivisors.length - 2)];

        const baseQuantityFrom = order.assetQuantityFrom.idiv(
            gcdFromAndToAndFee
        );
        const baseQuantityTo = order.assetQuantityTo.idiv(gcdFromAndToAndFee);

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
            const baseQuantityFee = order.assetQuantityFee.idiv(
                gcdFromAndToAndFee
            );
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

    public generateAssetTransferTxEntangled(orders: Order[], idxFee?: number) {
        const idxBox = this.assetManager.idxBox;
        const assets = this.assetManager.wallets;

        const gcdVal = orders
            .map(order =>
                gcd(
                    gcd(order.assetQuantityFrom, order.assetQuantityTo),
                    order.assetQuantityFee
                )
            )
            .reduce((a: U64, b: U64) => gcd(a, b));

        const commonDivisors = getDivisors(gcdVal);
        const randomQuantityMultiplier =
            commonDivisors[randRange(0, commonDivisors.length - 2)];

        const result = this.helper.sdk.core.createTransferAssetTransaction();

        for (let i = 0; i < orders.length; i++) {
            const idxFrom = idxBox[i];
            const idxTo = idxBox[(i + 1) % orders.length];

            const fromInput = assets[idxFrom].asset.createTransferInput();
            const baseQuantityFrom = orders[i].assetQuantityFrom.idiv(gcdVal);
            const baseQuantityTo = orders[i].assetQuantityTo.idiv(gcdVal);

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
                }
            );
            result.addInputs(fromInput).addOutputs(consistentOutputs);

            if (i === 0) {
                result.addOrder({
                    order: orders[i],
                    spentQuantity: spentFrom,
                    inputIndices: idxFee ? [i, orders.length] : [i],
                    outputIndices: idxFee
                        ? [
                              2 * i,
                              2 * i + 1,
                              2 * orders.length,
                              2 * orders.length + 1
                          ]
                        : [2 * i, 2 * i + 1]
                });
            } else {
                result.addOrder({
                    order: orders[i],
                    spentQuantity: spentFrom,
                    inputIndices: [i],
                    outputIndices: [2 * i, 2 * i + 1]
                });
            }
        }

        if (idxFee) {
            const feeInput = assets[idxBox[0]].feeAsset.createTransferInput();
            const baseQuantityFee = orders[0].assetQuantityFee.idiv(gcdVal);
            const feeTotal = baseQuantityFee.times(randomQuantityMultiplier);
            const assetTypeFee = assets[idxBox[0]].feeAsset.assetType;
            result.addInputs(feeInput);
            result.addOutputs(
                {
                    recipient: assets[idxBox[0]].owner,
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
