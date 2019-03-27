import { Order } from "codechain-sdk/lib/core/transaction/Order";
import { TransferAsset } from "codechain-sdk/lib/core/transaction/TransferAsset";
import { AssetManager } from "./AssetManager";
import Helper, { randRange } from "./util";

export class FlawGenerator {
    private helper: Helper;
    private assetManager: AssetManager;

    constructor(helper: Helper, assetManager: AssetManager) {
        this.helper = helper;
        this.assetManager = assetManager;
    }

    public polluteOrder(targetOrder: Order): Order {
        const methodList = [
            this.polluteAssetType,
            this.polluteQuantityFee,
            this.polluteRecipient,
            this.polluteOriginOutput
        ];
        const selected = methodList[randRange(0, methodList.length - 1)];
        return selected.bind(this)(targetOrder);
    }

    public polluteTransaction(targetTransaction: TransferAsset): TransferAsset {
        const methodList = [
            this.polluteSpentQuantity,
            this.polluteInputIndices,
            this.polluteOutputIndices,
            this.polluteInputs,
            this.polluteOutputs
        ];
        const selected = methodList[randRange(0, methodList.length - 1)];
        return selected.bind(this)(targetTransaction);
    }

    private polluteAssetType(target: Order): Order {
        const { assetTypeFrom, assetTypeTo, assetTypeFee, ...rest } = target;

        let newAssetTypeFrom;
        let newAssetTypeTo;
        let newAssetTypeFee;

        if (!rest.assetQuantityFee.eq(0)) {
            newAssetTypeFrom = assetTypeFrom;
            newAssetTypeTo = assetTypeTo;
            newAssetTypeFee = assetTypeFrom;
        } else {
            newAssetTypeFrom = assetTypeFrom;
            newAssetTypeTo = assetTypeFrom;
        }
        return this.helper.sdk.core.createOrder({
            assetTypeFrom: newAssetTypeFrom,
            assetTypeTo: newAssetTypeTo,
            assetTypeFee: newAssetTypeFee,
            ...rest
        });
    }

    private polluteQuantityFee(target: Order): Order {
        const { assetQuantityFee, ...rest } = target;

        const newAssetQuantityFee = assetQuantityFee.plus(1);
        return this.helper.sdk.core.createOrder({
            assetQuantityFee: newAssetQuantityFee,
            ...rest
        });
    }

    private polluteRecipient(target: Order): Order {
        const {
            lockScriptHashFrom,
            lockScriptHashFee,
            parametersFrom,
            parametersFee,
            assetQuantityFee,
            ...rest
        } = target;

        const newAssetQuantityFee = assetQuantityFee.eq(0)
            ? assetQuantityFee.plus(1)
            : assetQuantityFee;
        return this.helper.sdk.core.createOrder({
            lockScriptHashFrom,
            lockScriptHashFee: lockScriptHashFrom,
            parametersFrom,
            parametersFee: parametersFrom,
            assetQuantityFee: newAssetQuantityFee,
            ...rest
        });
    }

    private polluteOriginOutput(target: Order): Order {
        const { originOutputs, ...rest } = target;

        const wallets = this.assetManager.wallets;
        const idxBox = this.assetManager.idxBox;

        originOutputs.push(
            wallets[idxBox[idxBox.length - 1]].feeAsset.outPoint
        );
        return this.helper.sdk.core.createOrder({
            originOutputs,
            ...rest
        });
    }

    private polluteSpentQuantity(target: TransferAsset): TransferAsset {
        const result = this.helper.sdk.core.createTransferAssetTransaction();
        const inputs = target.inputs();
        const outputs = target.outputs();

        const { spentQuantity, ...rest } = target.orders()[0];
        const newSpentQuantity = spentQuantity.minus(1);

        result
            .addInputs(inputs)
            .addOutputs(outputs)
            .addOrder({
                spentQuantity: newSpentQuantity,
                ...rest
            });

        for (const order of target.orders().slice(1)) {
            result.addOrder(order);
        }

        return result;
    }

    private polluteInputIndices(target: TransferAsset): TransferAsset {
        const result = this.helper.sdk.core.createTransferAssetTransaction();
        const inputs = target.inputs();
        const outputs = target.outputs();

        const { inputIndices, ...rest } = target.orders()[0];
        inputIndices.push(0);

        result
            .addInputs(inputs)
            .addOutputs(outputs)
            .addOrder({
                inputIndices,
                ...rest
            });

        for (const order of target.orders().slice(1)) {
            result.addOrder(order);
        }

        return result;
    }

    private polluteOutputIndices(target: TransferAsset): TransferAsset {
        const result = this.helper.sdk.core.createTransferAssetTransaction();
        const inputs = target.inputs();
        const outputs = target.outputs();

        const { outputIndices, ...rest } = target.orders()[0];
        outputIndices.push(0);

        result
            .addInputs(inputs)
            .addOutputs(outputs)
            .addOrder({
                outputIndices,
                ...rest
            });

        for (const order of target.orders().slice(1)) {
            result.addOrder(order);
        }

        return result;
    }

    private polluteInputs(target: TransferAsset): TransferAsset {
        return target.addInputs(target.input(0)!);
    }

    private polluteOutputs(target: TransferAsset): TransferAsset {
        return target.addOutputs(target.output(0)!);
    }
}
