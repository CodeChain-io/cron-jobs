import { Asset } from "codechain-sdk/lib/core/Asset";
import {
    AssetAddress,
    TransferAsset
} from "codechain-sdk/lib/core/classes";
import * as _ from "lodash";
import Helper, { randRange } from "./util";

interface IWallet {
    owner: AssetAddress;
    asset: Asset;
    feeAsset: Asset;
}

export class AssetManager {
    private helper: Helper;
    private readonly _wallets: IWallet[];
    private readonly _idxBox: number[];
    private walletCnt: number;

    get wallets(): IWallet[] {
        return this._wallets;
    }

    get idxBox(): number[] {
        return this._idxBox;
    }

    constructor(helper: Helper, walletCnt: number) {
        this.helper = helper;
        this._wallets = [];
        this._idxBox = [...Array(walletCnt).keys()];
        this.walletCnt = walletCnt;
    }

    public async init() {
        for (let i = 0; i < this.walletCnt; i++) {
            const address = await this.helper.createP2PKHAddress();
            const asset = await this.helper.mintAsset({
                supply: 1e10,
                recipient: address
            });
            const feeAsset = await this.helper.mintAsset({
                supply: 1e11,
                recipient: address,
                metadata: "Assets only for order fees"
            });
            this.wallets.push({
                owner: address,
                asset,
                feeAsset
            });
        }
    }

    public async checkAndFill(idx: number) {
        const min = 100;
        const feeMultiple = 10;
        const owner = this.wallets[idx].owner;
        if (this.wallets[idx].asset.quantity.lt(min)) {
            const asset = await this.helper.mintAsset({
                supply: 1e10,
                recipient: owner
            });
            this.wallets[idx].asset = asset;
        }

        if (this.wallets[idx].asset.quantity.lt(min * feeMultiple)) {
            const feeAsset = await this.helper.mintAsset({
                supply: 1e11,
                recipient: owner,
                metadata: "Assets only for order fees"
            });
            this.wallets[idx].feeAsset = feeAsset;
        }
    }

    public assetEq(a: Asset, b: Asset) {
        return (
            a.assetType.value === b.assetType.value &&
            a.shardId === b.shardId &&
            a.lockScriptHash.value === b.lockScriptHash.value &&
            _.isEqual(a.parameters, b.parameters)
        );
    }

    public renewWalletsAfterTx(transferTx: TransferAsset, idxFrom: number) {
        const transferredAssets = transferTx.getTransferredAssets();
        for (const transferredAsset of transferredAssets) {
            for (const wallet of this.wallets) {
                if (this.assetEq(wallet.asset, transferredAsset)) {
                    wallet.asset = transferredAsset;
                }
            }
            if (
                this.assetEq(this.wallets[idxFrom].feeAsset, transferredAsset)
            ) {
                this.wallets[idxFrom].feeAsset = transferredAsset;
            }
        }
    }

    public shuffleBox() {
        for (let i = 0; i < 20; i++) {
            const targetidx1 = randRange(0, this.walletCnt - 1);
            const targetidx2 = randRange(0, this.walletCnt - 1);
            const temp = this._idxBox[targetidx1];
            this._idxBox[targetidx1] = this._idxBox[targetidx2];
            this._idxBox[targetidx2] = temp;
        }
    }
}
