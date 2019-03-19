import { U64 } from "codechain-primitives/lib";
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
     * @param idx An array index of assetManager's assets, which indicates an assetFrom in an Order.
     */
    public generateOrder(input: { idxFrom: number; idxTo: number }) {
        const { idxFrom, idxTo } = input;
        this.assetManager.checkAndFill(idxFrom);
        this.assetManager.checkAndFill(idxTo);
        const assets = this.assetManager.wallets;
        return this.helper.sdk.core.createOrder({
            assetTypeFrom: assets[idxFrom].asset.assetType,
            assetTypeTo: assets[idxTo].asset.assetType,
            shardIdFrom: 0,
            shardIdTo: 0,
            assetQuantityFrom: this.randomAssetQuantity() * 100,
            assetQuantityTo: this.randomAssetQuantity() * 100,
            expiration: U64.MAX_VALUE,
            originOutputs: [assets[idxFrom].asset.outPoint],
            recipientFrom: assets[idxFrom].owner
        });
    }

    private randomAssetQuantity(): number {
        return randRange(1, 99);
    }
}
