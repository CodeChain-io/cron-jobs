import { assert } from "chai";
import { SDK } from "codechain-sdk";
import { Asset, AssetTransferAddress } from "codechain-sdk/lib/core/classes";
import { KeyStore } from "codechain-sdk/lib/key/KeyStore";
import * as _ from "lodash";
import { getConfig, getCurrentSeq } from "./util";

const networkId: string = getConfig<string>("networkId");
const faucetAddress: string = getConfig<string>("faucetAddress");

export default class UTXOSet {
    private sdk: SDK;
    private assets: Asset[];
    private assetOwner: AssetTransferAddress | null;
    private keyStore: KeyStore;

    public constructor(sdk: SDK, keyStore: KeyStore) {
        this.sdk = sdk;
        this.assets = [];
        this.assetOwner = null;
        this.keyStore = keyStore;
    }

    public prepare = async () => {
        const assetOwnerKey = await this.keyStore.asset.createKey();
        this.assetOwner = AssetTransferAddress.fromTypeAndPayload(
            1,
            assetOwnerKey,
            {
                networkId
            }
        );
        const asset = await this.mintAsset();
        const splittedAssets = await this.splitAsset(asset);
        this.assets = splittedAssets;
    };

    public popAsset = (): Asset => {
        const asset = this.assets.pop();
        assert.isDefined(asset);
        return asset as Asset;
    };

    private mintAsset = async (): Promise<Asset> => {
        const assetScheme = this.sdk.core.createAssetScheme({
            shardId: 0,
            metadata: JSON.stringify({
                name: "Gold For TimelockTest",
                description: `An asset to test timelock ${Math.random()}`,
                icon_url: "https://static.majecty.tech/images/clock512.png"
            }),
            supply: 100
        });

        const transaction = this.sdk.core.createMintAssetTransaction({
            scheme: assetScheme,
            recipient: this.assetOwner!
        });

        const signedTransaction = await this.sdk.key.signTransaction(
            transaction,
            {
                account: faucetAddress,
                fee: 10,
                seq: await getCurrentSeq(this.sdk, faucetAddress)
            }
        );

        const minedTransaction = await this.sdk.rpc.chain.sendSignedTransaction(
            signedTransaction
        );

        const result = await this.sdk.rpc.chain.getTransactionResult(
            minedTransaction,
            {
                timeout: 10 * 1000
            }
        );

        if (result !== true) {
            throw new Error(`Mint transaction is not processed ${result}`);
        }

        return transaction.getMintedAsset();
    };

    private splitAsset = async (asset: Asset): Promise<Asset[]> => {
        const outputs = _.range(0, 100).map(() => ({
            recipient: this.assetOwner!,
            quantity: 1,
            assetType: asset.assetType,
            shardId: asset.shardId
        }));
        const transaction = this.sdk.core
            .createTransferAssetTransaction()
            .addInputs(asset)
            .addOutputs(outputs);

        await this.sdk.key.signTransactionInput(transaction, 0, {
            keyStore: this.keyStore
        });

        const signedTransaction = await this.sdk.key.signTransaction(
            transaction,
            {
                account: faucetAddress,
                fee: 10,
                seq: await getCurrentSeq(this.sdk, faucetAddress)
            }
        );

        const txHash = await this.sdk.rpc.chain.sendSignedTransaction(
            signedTransaction
        );

        const result = await this.sdk.rpc.chain.getTransactionResult(txHash, {
            timeout: 10 * 1000
        });

        if (result !== true) {
            throw new Error(`Spliting asset failed ${result}`);
        }

        return transaction.getTransferredAssets();
    };
}
