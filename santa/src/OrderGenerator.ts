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
    public generateOrder(
        input: {
            idxFrom: number;
            idxTo: number;
            idxFee?: number;
        },
        assetQuantityFrom: U64 = new U64(this.randomAssetQuantity() * 100),
        assetQuantityTo: U64 = new U64(this.randomAssetQuantity() * 100)
    ) {
        const { idxFrom, idxTo, idxFee } = input;
        this.assetManager.checkAndFill(idxFrom);
        this.assetManager.checkAndFill(idxTo);

        const feeMultiple = randRange(1, 10);
        const wallets = this.assetManager.wallets;

        const originOutputs = [wallets[idxFrom].asset.outPoint];
        if (idxFee) {
            originOutputs.push(wallets[idxFrom].feeAsset.outPoint);
        }
        if (idxFee) {
            return this.helper.sdk.core.createOrder({
                assetTypeFrom: wallets[idxFrom].asset.assetType,
                assetTypeTo: wallets[idxTo].asset.assetType,
                assetTypeFee: wallets[idxFrom].feeAsset.assetType,
                shardIdFrom: 0,
                shardIdTo: 0,
                shardIdFee: 0,
                assetQuantityFrom,
                assetQuantityTo,
                assetQuantityFee: assetQuantityFrom.times(feeMultiple),
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
                assetQuantityTo,
                expiration: U64.MAX_VALUE,
                originOutputs,
                recipientFrom: wallets[idxFrom].owner
            });
        }
    }

    // Assumption : cnt >= 2
    public generateNEntangledOrders(cnt: number, idxFee?: number): Order[] {
        const idxBox = this.assetManager.idxBox;
        const result: Order[] = [];
        result.push(
            this.generateOrder({ idxFrom: idxBox[0], idxTo: idxBox[1], idxFee })
        );

        for (let i = 0; i < cnt - 2; i++) {
            result.push(
                this.generateOrder(
                    {
                        idxFrom: idxBox[i + 1],
                        idxTo: idxBox[i + 2]
                    },
                    result[i].assetQuantityTo
                )
            );
        }

        const last = this.generateDualOrder(
            this.compress(result, idxBox[0]),
            idxBox[cnt - 1]
        );
        result.push(last);

        return result;
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

    // Assumption : all middle values are coherent.
    private compress(target: Order[], idxFirstFrom: number): Order {
        const fst = target[0];
        const last = target[target.length - 1];
        const wallets = this.assetManager.wallets;
        return this.helper.sdk.core.createOrder({
            assetTypeFrom: fst.assetTypeFrom,
            assetTypeTo: last.assetTypeTo,
            shardIdFrom: fst.shardIdFrom,
            shardIdTo: last.shardIdTo,
            assetQuantityFrom: fst.assetQuantityFrom,
            assetQuantityTo: last.assetQuantityTo,
            expiration: fst.expiration,
            originOutputs: [wallets[idxFirstFrom].asset.outPoint],
            recipientFrom: wallets[idxFirstFrom].owner
        });
    }

    private randomAssetQuantity(): number {
        return randRange(1, 99);
    }
}
