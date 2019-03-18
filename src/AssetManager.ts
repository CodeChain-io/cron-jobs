import { SDK } from "codechain-sdk";
import { Asset } from "codechain-sdk/lib/core/Asset";
import { AssetTransferAddress, TransferAsset } from "codechain-sdk/lib/core/classes";
import Helper from "./util";

interface IWallet {
    owner: AssetTransferAddress;
    asset: Asset;
}

export class AssetManager {
    private helper : Helper;
    private sdk : SDK;
    private wallets : IWallet[];
    private walletCnt : number;

    constructor(helper : Helper, sdk: SDK, walletCnt: number) {
        this.helper = helper;
        this.sdk = sdk;
        this.wallets = [];
        this.walletCnt = walletCnt;
    }

    public async init() {
        for(let i = 0; i < this.walletCnt; i++) {
            const address = await this.helper.createP2PKHAddress();
            const asset = await this.helper.mintAsset({
                supply: 1e10,
                recipient: address
            })
            this.wallets.push({
                owner: address,
                asset
            });
        }
    }

    public async checkAndFill(idx : number) {
        const min = 100;
        if (this.wallets[idx].asset.quantity.lt(min)) {
            const owner = this.wallets[idx].owner;
            const asset = await this.helper.mintAsset({
                supply: 1e10,
                recipient: owner
            })
            this.wallets[idx].asset = asset;
        }
    }

    public async renewWalletsAfterTx(transferTx : TransferAsset) {
        const transferredAssets = transferTx.getTransferredAssets();
        for(const transferredAsset of transferredAssets) {
            for(const wallet of this.wallets) {
                const assetEq = wallet.asset.assetType === transferredAsset.assetType
                            && wallet.asset.shardId === transferredAsset.shardId
                            && wallet.asset.lockScriptHash === transferredAsset.lockScriptHash
                            && wallet.asset.parameters === transferredAsset.parameters

                if (assetEq) {
                    wallet.asset = transferredAsset;
                }
            }
        }
    }
}
