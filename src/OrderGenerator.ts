import { U64 } from "codechain-primitives/lib";
import { SDK } from "codechain-sdk";
import { AssetManager } from "./AssetManager";
import Helper from "./util";

export class OrderGenerator {
    private helper: Helper;
    private sdk: SDK;
    private assetManager: AssetManager;

    constructor(helper: Helper, sdk: SDK, assetManager: AssetManager) {
        this.helper = helper;
        this.sdk = sdk;
        this.assetManager = assetManager;
    }

    public randomAssetQuantity(): number {
        const min = 1;
        const max = 99;

        return Math.floor(min + Math.random() * (max + 1 - min));
    }

    /**
     * @param idx An array index of assetManager's assets, which indicates an assetFrom in an Order.
     */
    public generateOrder(input: { idxFrom: number; idxTo: number }) {
        const { idxFrom, idxTo } = input;
        this.assetManager.checkAndFill(idxFrom);
        this.assetManager.checkAndFill(idxTo);
        const assets = this.assetManager.wallets;
        this.sdk.core.createOrder({
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
}
