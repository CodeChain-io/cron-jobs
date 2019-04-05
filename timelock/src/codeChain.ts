import * as chai from "chai";
import { SDK } from "codechain-sdk";
import {
    Asset,
    Block,
    H256,
    PlatformAddress,
    SignedTransaction,
    Timelock
} from "codechain-sdk/lib/core/classes";
import {
    AssetTransferInput,
    AssetTransferInputJSON
} from "codechain-sdk/lib/core/transaction/AssetTransferInput";
import { TransferAssetActionJSON } from "codechain-sdk/lib/core/transaction/TransferAsset";
import { MemoryKeyStore } from "codechain-sdk/lib/key/MemoryKeyStore";
import * as _ from "lodash";
import { TRANSACTION_TIMEOUT } from "./constant";
import * as timelockScript from "./timelockScript";
import {
    createRandomAssetAddress,
    delay,
    getConfig,
    getCurrentSeq,
    waitContainTransacitonSuccess
} from "./util";
import UTXOSet from "./utxoSet";

type NetworkId = "tc" | "wc";

const networkId: "tc" | "wc" = getConfig<NetworkId>("networkId");
const codeChainRPCURL: string = getConfig<string>("codeChainRPCURL");
const faucetAddress: string = getConfig<string>("faucetAddress");

export default class CodeChain {
    private sdk: SDK;
    private noopAccountId: string | null;
    private transientKeyStore: MemoryKeyStore;

    public constructor() {
        this.sdk = new SDK({
            server: codeChainRPCURL,
            networkId,
            keyStoreType: "local"
        });

        this.transientKeyStore = new MemoryKeyStore();
        this.noopAccountId = null;
        this.transientKeyStore.platform
            .createKey({
                passphrase: ""
            })
            .then(accountId => {
                this.noopAccountId = accountId;
            });
    }

    public getCurrentBlock = async (): Promise<Block> => {
        const bestBlockNumber = await this.sdk.rpc.chain.getBestBlockNumber();
        return (await this.sdk.rpc.chain.getBlock(bestBlockNumber))!;
    };

    public prepareUTXOs = async (startBlock: Block): Promise<UTXOSet> => {
        const utxoSet = new UTXOSet(
            this.sdk,
            this.transientKeyStore,
            startBlock
        );
        await utxoSet.prepare();
        return utxoSet;
    };

    public createTransaction = async (params: {
        input: Asset;
        timelock: Timelock | null;
        useTimelockOnInput: boolean;
    }): Promise<SignedTransaction> => {
        const useCustomLockScript = _.some(
            timelockScript.getAllLockScriptHashes(),
            hash => hash.isEqualTo(params.input.outPoint.lockScriptHash!)
        );

        let transactionInput;
        if (useCustomLockScript) {
            transactionInput = new AssetTransferInput({
                prevOut: params.input.outPoint,
                timelock: params.useTimelockOnInput ? params.timelock : null,
                lockScript: timelockScript.getLockScript(params.timelock!.type),
                unlockScript: timelockScript.getUnlockScript()
            });
        } else {
            transactionInput = new AssetTransferInput({
                prevOut: params.input.outPoint,
                timelock: params.timelock
            });
        }
        const transaction = this.sdk.core
            .createTransferAssetTransaction()
            .addInputs(transactionInput)
            .addOutputs({
                recipient: await createRandomAssetAddress(),
                quantity: params.input.quantity,
                assetType: params.input.assetType,
                shardId: params.input.shardId
            });

        if (!useCustomLockScript) {
            await this.sdk.key.signTransactionInput(transaction, 0, {
                keyStore: this.transientKeyStore
            });
        }

        const signedTransaction = await this.sdk.key.signTransaction(
            transaction,
            {
                account: faucetAddress,
                fee: 100,
                seq: await getCurrentSeq(this.sdk, faucetAddress)
            }
        );
        return signedTransaction;
    };

    public sendTransaction(transaction: SignedTransaction): Promise<H256> {
        return this.sdk.rpc.chain.sendSignedTransaction(transaction);
    }

    public waitFutureBlock = async (params: {
        canHandle: SignedTransaction;
    }): Promise<Block> => {
        const txJSON = params.canHandle.toJSON();
        chai.assert.strictEqual(txJSON.action.type, "transferAsset");
        const transferActionJSON = txJSON.action as TransferAssetActionJSON;
        const timelocks = await Promise.all(
            transferActionJSON.inputs
                .filter(input => input.timelock)
                .map(async input => {
                    const {
                        blockNumber,
                        timestamp
                    } = await this.getPrevOutBlockInfo(input);
                    return {
                        input,
                        prevOutBlockNumber: blockNumber,
                        prevOutBlockTimestamp: timestamp
                    };
                })
        );

        let currentBlockNumber = await this.sdk.rpc.chain.getBestBlockNumber();
        let bestBlock = (await this.sdk.rpc.chain.getBlock(
            currentBlockNumber
        ))!;

        while (true) {
            const allPassed = _.every(timelocks, timelock =>
                this.checkTimelock(bestBlock, timelock)
            );
            if (allPassed) {
                return bestBlock;
            }

            while (true) {
                await delay(500);
                const nextBlock = await this.sdk.rpc.chain.getBlock(
                    currentBlockNumber + 1
                );
                if (nextBlock !== null) {
                    bestBlock = nextBlock;
                    currentBlockNumber = bestBlock.number;
                    break;
                }
            }
        }
    };

    public waitTransactionMined = async (txHash: H256): Promise<void> => {
        await waitContainTransacitonSuccess(
            this.sdk,
            txHash,
            TRANSACTION_TIMEOUT
        );
    };

    public containsTransaction = async (txHash: H256): Promise<boolean> => {
        return this.sdk.rpc.chain.containsTransaction(txHash);
    };

    public getBlockOfTransaction = async (
        transaction: SignedTransaction
    ): Promise<Block> => {
        const minedTransaction = (await this.sdk.rpc.chain.getTransaction(
            transaction.hash()
        ))!;
        const minedBlockHash = minedTransaction.blockHash!;
        return (await this.sdk.rpc.chain.getBlock(minedBlockHash))!;
    };

    public fillMoneyForNoop = async (): Promise<void> => {
        if (this.noopAccountId === null) {
            await delay(1000);
        }

        if (this.noopAccountId === null) {
            throw new Error("Noop account id is null");
        }

        const payTransaction = this.sdk.core.createPayTransaction({
            recipient: PlatformAddress.fromAccountId(this.noopAccountId!, {
                networkId
            }),
            quantity: 10000
        });

        const signedTransaction = await this.sdk.key.signTransaction(
            payTransaction,
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
    };

    public sendNoopTransaction = async (): Promise<void> => {
        if (this.noopAccountId === null) {
            throw new Error("Noop account id is null");
        }

        const noopPlatformAddress = PlatformAddress.fromAccountId(
            this.noopAccountId!,
            {
                networkId
            }
        );

        const payTransaction = this.sdk.core.createPayTransaction({
            recipient: noopPlatformAddress,
            quantity: 1
        });

        const signedTransaction = await this.sdk.key.signTransaction(
            payTransaction,
            {
                keyStore: this.transientKeyStore,
                account: noopPlatformAddress,
                fee: 100,
                seq: await getCurrentSeq(this.sdk, noopPlatformAddress)
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
    };

    private checkTimelock = (
        currentBlock: Block,
        timelockCtx: TimelockContext
    ): boolean => {
        const timelock = timelockCtx.input.timelock!;
        switch (timelock.type) {
            case "block":
                return timelock.value <= currentBlock.number;
            case "blockAge":
                return (
                    timelockCtx.prevOutBlockNumber + timelock.value <=
                    currentBlock.number
                );
            case "time":
                return timelock.value <= currentBlock.timestamp;
            case "timeAge":
                return (
                    timelockCtx.prevOutBlockTimestamp + timelock.value <=
                    currentBlock.timestamp
                );
            default:
                throw new Error("Invalid timelock type");
        }
    };

    private getPrevOutBlockInfo = async (
        input: AssetTransferInputJSON
    ): Promise<{ blockNumber: number; timestamp: number }> => {
        const tx = await this.sdk.rpc.chain.getTransactionByTracker(
            input.prevOut.tracker
        );
        const prevOutBlockHash = tx!.blockHash!;

        const block = (await this.sdk.rpc.chain.getBlock(prevOutBlockHash))!;
        return {
            blockNumber: block.number,
            timestamp: block.timestamp
        };
    };
}

interface TimelockContext {
    input: AssetTransferInputJSON;
    prevOutBlockNumber: number;
    prevOutBlockTimestamp: number;
}
