import { PlatformAddress } from "codechain-primitives";
import { SDK } from "codechain-sdk";
import { Asset } from "codechain-sdk/lib/core/Asset";
import { AssetTransferInput } from "codechain-sdk/lib/core/transaction/AssetTransferInput";
import * as config from "config";
import { shuffle } from "underscore";
import { activateApprovers } from "./active";
import { sendMints, sendTransaction } from "./sendTx";
import { approve } from "./src/approve";
import {
    createApprovers,
    loadApprovers,
    storeApprovers
} from "./src/approvers";
import { mintHands } from "./src/mintHands";
import { createShardId, loadShardId, storeShardId } from "./src/shard";
import { createUsers, loadUsers, storeUsers } from "./src/users";
import { wait } from "./src/wait";

const USERS_FILE_NAME = ".users";
const SHARD_ID_FILE_NAME = ".shard";
const APPROVERS_FILE_NAME = ".approvers";

if (require.main === module) {
    const rpcUrl = config.get<string>("rpc_url")!;
    const networkId = config.get<string>("network_id")!;
    const passphrase = config.get<string>("passphrase");
    const payer = config.get<string>("payer");

    if (!PlatformAddress.check(payer)) {
        throw Error(`Invalid payer ${payer}`);
    }

    const sdk = new SDK({ server: rpcUrl, networkId });
    (async () => {
        const users = await loadUsers(USERS_FILE_NAME).catch((err: Error) => {
            console.error(err.message);
            return createUsers(sdk, passphrase).then(
                async (createdUsers): Promise<string[]> => {
                    await storeUsers(USERS_FILE_NAME, createdUsers);
                    return createdUsers;
                }
            );
        });

        const shardId = await loadShardId(SHARD_ID_FILE_NAME).catch(
            (err: Error) => {
                console.error(err.message);
                return createShardId(sdk, payer, passphrase).then(async id => {
                    console.log(`Shard(${id}) is created`);
                    await storeShardId(SHARD_ID_FILE_NAME, id);
                    return id;
                });
            }
        );

        const [
            hourApprover,
            minuteApprover,
            secondApprover
        ] = await loadApprovers(APPROVERS_FILE_NAME).catch((err: Error) => {
            console.error(err.message);
            return createApprovers(sdk, passphrase).then(
                async ([approver1, approver2, approver3]) => {
                    console.log(`Hour approver(${approver1}) is created`);
                    console.log(`Minute approver(${approver2}) is created`);
                    console.log(`Second approver(${approver3}) is created`);
                    await storeApprovers(
                        APPROVERS_FILE_NAME,
                        approver1,
                        approver2,
                        approver3
                    );
                    return [approver1, approver2, approver3];
                }
            );
        });

        // Activate the approvers
        await activateApprovers(sdk, {
            approvers: [hourApprover, minuteApprover, secondApprover],
            payer,
            passphrase
        });

        const mintedDate = new Date();
        const mints = mintHands(
            sdk,
            shardId,
            users,
            mintedDate,
            hourApprover,
            minuteApprover,
            secondApprover
        );

        const [mintHashes, nextSeq] = await sendMints(sdk, mints, {
            payer,
            passphrase
        });
        let seq = nextSeq; // TODO: quirks because of tslint

        for (const hash of mintHashes) {
            while (true) {
                const result = await sdk.rpc.chain.getTransactionResult(hash);
                if (result) {
                    break;
                }
                if (result == null) {
                    await wait(1_000);
                    continue;
                }
                console.error(
                    `Cannot mint the clock hand: ${await sdk.rpc.chain.getErrorHint(
                        hash
                    )}`
                );
                return;
            }
        }

        console.log("Clock hands are minted");
        let hourAsset = mints[0].getMintedAsset();
        let minuteAsset = mints[1].getMintedAsset();
        let secondAsset = mints[2].getMintedAsset();

        const hourType = hourAsset.assetType;
        const minuteType = minuteAsset.assetType;
        const secondType = secondAsset.assetType;

        let pendings: [string, Asset, Asset, Asset, Date, number][] = [];

        let previousDate = mintedDate;
        const transferFunction = async () => {
            try {
                const current = new Date();
                const hourChanged =
                    current.getUTCHours() !== previousDate.getUTCHours();
                const minuteChanged =
                    hourChanged ||
                    current.getUTCMinutes() !== previousDate.getUTCMinutes();
                const unshuffledInputs = [];
                const outputs = [];
                if (hourChanged) {
                    outputs.push(
                        sdk.core.createAssetTransferOutput({
                            assetType: hourType,
                            shardId,
                            quantity: 1,
                            recipient: users[current.getUTCHours()]
                        })
                    );
                    unshuffledInputs.push(hourAsset.createTransferInput());
                }

                if (minuteChanged) {
                    outputs.push(
                        sdk.core.createAssetTransferOutput({
                            assetType: minuteType,
                            shardId,
                            quantity: 1,
                            recipient: users[current.getUTCMinutes()]
                        })
                    );
                    unshuffledInputs.push(minuteAsset.createTransferInput());
                }

                outputs.push(
                    sdk.core.createAssetTransferOutput({
                        assetType: secondType,
                        shardId,
                        quantity: 1,
                        recipient: users[current.getUTCSeconds()]
                    })
                );
                unshuffledInputs.push(secondAsset.createTransferInput());

                const inputs = shuffle<AssetTransferInput>(unshuffledInputs);

                const transfer = sdk.core.createTransferAssetTransaction({
                    inputs,
                    outputs,
                    metadata: `Current time is ${current}`
                });
                await sdk.key.signTransactionInput(transfer, 0, { passphrase });
                const approvers = [secondApprover];
                if (minuteChanged) {
                    await sdk.key.signTransactionInput(transfer, 1, {
                        passphrase
                    });
                    approvers.push(minuteApprover);
                    if (hourChanged) {
                        await sdk.key.signTransactionInput(transfer, 2, {
                            passphrase
                        });
                        approvers.push(hourApprover);
                    }
                }
                for (const approver of shuffle<string>(approvers)) {
                    await approve(sdk, transfer, approver, passphrase);
                }

                const hash = await sendTransaction(
                    sdk,
                    payer,
                    passphrase,
                    seq,
                    transfer
                );
                console.log(`Clock hands are moved at ${current}:${hash}`);
                pendings.push([
                    hash.value,
                    hourAsset,
                    minuteAsset,
                    secondAsset,
                    current,
                    seq
                ]);

                let assetIndex = 0;
                if (hourChanged) {
                    hourAsset = transfer.getTransferredAsset(assetIndex);
                    assetIndex += 1;
                }
                if (minuteChanged) {
                    minuteAsset = transfer.getTransferredAsset(assetIndex);
                    assetIndex += 1;
                }
                secondAsset = transfer.getTransferredAsset(assetIndex);

                seq += 1;

                const timeout = Math.max(
                    current.getTime() + 1_000 - Date.now(),
                    0
                );
                previousDate = current;
                setTimeout(transferFunction, timeout);
            } catch (ex) {
                console.error(ex);
            }
        };

        const resultFunction = async () => {
            try {
                while (pendings.length !== 0) {
                    const hash = pendings[0][0];
                    const result = await sdk.rpc.chain.getTransactionResult(
                        hash
                    );
                    if (result) {
                        pendings.pop();
                        break;
                    }
                    const current = pendings[0][4];
                    if (result == null) {
                        console.log(
                            `Wait the result of ${hash} sent at ${current}`
                        );
                        setTimeout(resultFunction, 1_000);
                        return;
                    }
                    const reason = await sdk.rpc.chain.getErrorHint(hash);
                    console.log(
                        `Tx(${hash} sent at ${current} failed: ${reason}`
                    );

                    hourAsset = pendings[0][1];
                    minuteAsset = pendings[0][2];
                    secondAsset = pendings[0][3];
                    seq = pendings[0][5];
                    pendings = [];
                }

                setTimeout(resultFunction, 500);
            } catch (ex) {
                console.error(ex);
            }
        };
        setTimeout(resultFunction, 500);

        setTimeout(transferFunction, 1_000);
    })().catch(console.error);
}
