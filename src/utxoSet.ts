import { assert } from "chai";
import { U64 } from "codechain-primitives/lib";
import { SDK } from "codechain-sdk";
import {
    Asset,
    AssetTransferAddress,
    AssetTransferOutput,
    Block,
    Timelock
} from "codechain-sdk/lib/core/classes";
import { KeyStore } from "codechain-sdk/lib/key/KeyStore";
import * as _ from "lodash";
import { TRANSACTION_TIMEOUT } from "./constant";
import { getLockScriptHash } from "./timelockScript";
import {
    getConfig,
    getCurrentSeq,
    waitContainTransacitonSuccess
} from "./util";

const faucetAddress = getConfig<string>("faucetAddress");
const networkId = getConfig<string>("networkId");

const TIMELOCK_BLOCK = 1;
const TIMELOCK_BLOCK_AGE = 2;
const TIMELOCK_TIME = 3;
const TIMELOCK_TIME_AGE = 4;

export default class UTXOSet {
    private sdk: SDK;
    private pbkhAssets: Asset[];
    private timelockAssets: Asset[];
    private assetOwner: AssetTransferAddress | null;
    private keyStore: KeyStore;
    private currentBlock: Block;

    public constructor(sdk: SDK, keyStore: KeyStore, currentBlock: Block) {
        this.sdk = sdk;
        this.pbkhAssets = [];
        this.timelockAssets = [];
        this.assetOwner = null;
        this.keyStore = keyStore;
        this.currentBlock = currentBlock;
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
        {
            const asset = await this.mintAsset();
            const splittedAssets = await this.splitToPBKHAssets(asset);
            this.pbkhAssets = splittedAssets;
        }
        {
            const asset = await this.mintAsset();
            const splittedAssets = await this.splitToTimelockAssets(asset);
            this.timelockAssets = splittedAssets;
        }
    };

    public popPBKHAsset = (): Asset => {
        const asset = this.pbkhAssets.pop();
        assert.isDefined(asset);
        return asset as Asset;
    };

    public getTimelockAsset = (timelockType: Timelock["type"]): Asset => {
        switch (timelockType) {
            case "block":
                return this.timelockAssets[0];
            case "blockAge":
                return this.timelockAssets[1];
            case "time":
                return this.timelockAssets[2];
            case "timeAge":
                return this.timelockAssets[3];
        }
        throw new Error("Invalid timelockType");
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
                fee: 100_000,
                seq: await getCurrentSeq(this.sdk, faucetAddress)
            }
        );

        const minedTransaction = await this.sdk.rpc.chain.sendSignedTransaction(
            signedTransaction
        );

        await waitContainTransacitonSuccess(
            this.sdk,
            minedTransaction,
            TRANSACTION_TIMEOUT
        );

        return transaction.getMintedAsset();
    };

    private splitToPBKHAssets = async (asset: Asset): Promise<Asset[]> => {
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
                fee: 100,
                seq: await getCurrentSeq(this.sdk, faucetAddress)
            }
        );

        const txHash = await this.sdk.rpc.chain.sendSignedTransaction(
            signedTransaction
        );

        await waitContainTransacitonSuccess(
            this.sdk,
            txHash,
            TRANSACTION_TIMEOUT
        );

        return transaction.getTransferredAssets();
    };

    private splitToTimelockAssets = async (asset: Asset): Promise<Asset[]> => {
        const outputs = _.range(1, 5).map(index => {
            let parameters: Buffer[] = [];
            switch (index) {
                case TIMELOCK_BLOCK:
                    parameters = [u64ToBuffer(this.currentBlock.number + 10)];
                    break;
                case TIMELOCK_BLOCK_AGE:
                    parameters = [u64ToBuffer(10)];
                    break;
                case TIMELOCK_TIME:
                    parameters = [
                        u64ToBuffer(this.currentBlock.timestamp + 30)
                    ];
                    break;
                case TIMELOCK_TIME_AGE:
                    parameters = [u64ToBuffer(30)];
                    break;
            }
            return new AssetTransferOutput({
                lockScriptHash: getLockScriptHash(index),
                parameters,
                assetType: asset.assetType,
                shardId: 0,
                quantity: new U64(25)
            });
        });

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
                fee: 100,
                seq: await getCurrentSeq(this.sdk, faucetAddress)
            }
        );

        const txHash = await this.sdk.rpc.chain.sendSignedTransaction(
            signedTransaction
        );

        await waitContainTransacitonSuccess(
            this.sdk,
            txHash,
            TRANSACTION_TIMEOUT
        );
        return transaction.getTransferredAssets();
    };
}

function u64ToBuffer(num: number): Buffer {
    // DataView does not support u64
    if (num > 4294967295) {
        throw new Error("Number is too big");
    }
    const internalBuffer = new ArrayBuffer(4);
    new DataView(internalBuffer).setUint32(0, num, false /* littleEndian */);
    return Buffer.from(internalBuffer);
}
