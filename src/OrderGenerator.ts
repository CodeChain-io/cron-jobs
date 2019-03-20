import { U64 } from "codechain-primitives/lib";
import { Order } from "codechain-sdk/lib/core/transaction/Order";
import { AssetManager } from "./AssetManager";
import Helper, { randRange } from "./util";

export class OrderGenerator {
    private helper: Helper;
    private assetManager: AssetManager;

    constructor(helper: Helper, assetManager: AssetManager) {
        this.helper = helper;
        this.assetManager = assetManager;
    }

    /**
     * @param idx An array index of assetManager's wallets, which indicates an assetFrom in an Order.
     */
    public generateOrder(input: {
        idxFrom: number;
        idxTo: number;
        idxFee?: number;
    }) {
        const { idxFrom, idxTo, idxFee } = input;
        this.assetManager.checkAndFill(idxFrom);
        this.assetManager.checkAndFill(idxTo);

        const feeMultiple = randRange(1, 10);
        const wallets = this.assetManager.wallets;

        const originOutputs = [wallets[idxFrom].asset.outPoint];
        if (idxFee) {
            originOutputs.push(wallets[idxFrom].feeAsset.outPoint);
        }
        const assetQuantityFrom = this.randomAssetQuantity() * 100;

        if (idxFee) {
            return this.helper.sdk.core.createOrder({
                assetTypeFrom: wallets[idxFrom].asset.assetType,
                assetTypeTo: wallets[idxTo].asset.assetType,
                assetTypeFee: wallets[idxFrom].feeAsset.assetType,
                shardIdFrom: 0,
                shardIdTo: 0,
                shardIdFee: 0,
                assetQuantityFrom,
                assetQuantityTo: this.randomAssetQuantity() * 100,
                assetQuantityFee: assetQuantityFrom * feeMultiple,
                expiration: U64.MAX_VALUE,
                originOutputs,
                recipientFrom: wallets[idxFrom].owner,
                recipientFee: wallets[idxFee].owner
            });
        } else {
            return this.helper.sdk.core.createOrder({
                assetTypeFrom: wallets[idxFrom].asset.assetType,
                assetTypeTo: wallets[idxTo].asset.assetType,
                shardIdFrom: 0,
                shardIdTo: 0,
                shardIdFee: 0,
                assetQuantityFrom,
                assetQuantityTo: this.randomAssetQuantity() * 100,
                expiration: U64.MAX_VALUE,
                originOutputs,
                recipientFrom: wallets[idxFrom].owner
            });
        }
    }

    public generateDualOrder(target: Order, idxFrom: number) {
        const wallets = this.assetManager.wallets;
        return this.helper.sdk.core.createOrder({
            assetTypeFrom: target.assetTypeTo,
            assetTypeTo: target.assetTypeFrom,
            shardIdFrom: target.shardIdTo,
            shardIdTo: target.shardIdFrom,
            assetQuantityFrom: target.assetQuantityTo,
            assetQuantityTo: target.assetQuantityFrom,
            expiration: target.expiration,
            originOutputs: [wallets[idxFrom].asset.outPoint],
            recipientFrom: wallets[idxFrom].owner
        });
    }

    private randomAssetQuantity(): number {
        return randRange(1, 99);
    }
}
