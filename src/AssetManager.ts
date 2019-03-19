import { Asset } from "codechain-sdk/lib/core/Asset";
import {
    AssetTransferAddress,
    TransferAsset
} from "codechain-sdk/lib/core/classes";
import * as _ from "lodash";
import Helper from "./util";

interface IWallet {
    owner: AssetTransferAddress;
    asset: Asset;
}

export class AssetManager {
    private helper: Helper;
    private readonly _wallets: IWallet[];
    private walletCnt: number;

    get wallets(): IWallet[] {
        return this._wallets;
    }

    constructor(helper: Helper, walletCnt: number) {
        this.helper = helper;
        this._wallets = [];
        this.walletCnt = walletCnt;
    }

    public async init() {
        for (let i = 0; i < this.walletCnt; i++) {
            const address = await this.helper.createP2PKHAddress();
            const asset = await this.helper.mintAsset({
                supply: 1e10,
                recipient: address
            });
            this.wallets.push({
                owner: address,
                asset
            });
        }
    }

    public async checkAndFill(idx: number) {
        const min = 100;
        if (this.wallets[idx].asset.quantity.lt(min)) {
            const owner = this.wallets[idx].owner;
            const asset = await this.helper.mintAsset({
                supply: 1e10,
                recipient: owner
            });
            this.wallets[idx].asset = asset;
        }
    }

    public async renewWalletsAfterTx(transferTx: TransferAsset) {
        const transferredAssets = transferTx.getTransferredAssets();
        for (const transferredAsset of transferredAssets) {
            for (const wallet of this.wallets) {
                const assetEq =
                    wallet.asset.assetType.value ===
                        transferredAsset.assetType.value &&
                    wallet.asset.shardId === transferredAsset.shardId &&
                    wallet.asset.lockScriptHash.value ===
                        transferredAsset.lockScriptHash.value &&
                    _.isEqual(
                        wallet.asset.parameters,
                        transferredAsset.parameters
                    );

                if (assetEq) {
                    wallet.asset = transferredAsset;
                }
            }
        }
    }
}
