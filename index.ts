import { PlatformAddress } from "codechain-primitives";
import { SDK } from "codechain-sdk";
import { Asset } from "codechain-sdk/lib/core/Asset";
import { AssetTransferInput } from "codechain-sdk/lib/core/transaction/AssetTransferInput";
import * as config from "config";
import { shuffle } from "underscore";
import { calculateSeq, sendMints, sendTransaction } from "./sendTx";
import { mintHands } from "./src/mintHands";
import { createUsers, loadUsers, storeUsers } from "./src/users";

function wait(timeout: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, timeout);
    });
}

async function isActiveAccount(sdk: SDK, account: string): Promise<boolean> {
    const balance = await sdk.rpc.chain.getBalance(account);
    if (!balance.isEqualTo(0)) {
        return true;
    }

    const seq = await sdk.rpc.chain.getSeq(account);
    return seq !== 0;
}

async function activateApprovers(
    sdk: SDK,
    params: { approvers: string[]; payer: string; passphrase: string }
): Promise<void> {
    const { approvers, payer, passphrase } = params;

    const recipients = [];
    for (const approver of approvers) {
        if (!(await isActiveAccount(sdk, approver))) {
            recipients.push(approver);
        }
    }
    if (recipients.length === 0) {
        return;
    }

    let hashes = [];
    let seq = await calculateSeq(sdk, payer);
    for (const recipient of recipients) {
        const pay = sdk.core.createPayTransaction({
            recipient,
            quantity: 1
        });
        hashes.push(await sendTransaction(sdk, payer, passphrase, seq, pay));
        seq += 1;
    }

    while (true) {
        if (hashes.length === 0) {
            break;
        }
        const results = await Promise.all(
            hashes.map(hash => sdk.rpc.chain.getTransactionResult(hash))
        );
        const len = results.length;
        const nextHashes = [];
        for (let index = 0; index < len; index += 1) {
            const hash = hashes[index];
            if (results[index] == null) {
                nextHashes.push(hashes[index]);
                continue;
            }

            if (!results[index]) {
                throw Error(
                    `Cannot activate the account: ${await sdk.rpc.chain.getErrorHint(
                        hash
                    )}`
                );
            }
        }
        if (nextHashes.length !== 0) {
            await wait(1_000);
        }
        hashes = nextHashes;
    }
}

const BACKUP_FILE_NAME = ".users";

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
        const [
            hourApprover,
            minuteApprover,
            secondApprover,
            users
        ] = await loadUsers(BACKUP_FILE_NAME).catch((err: Error) => {
            console.error(err.message);
            return createUsers(sdk, passphrase).then(
                async ([
                    approver1,
                    approver2,
                    approver3,
                    createdUsers
                ]): Promise<[string, string, string, string[]]> => {
                    console.log(`Hour approver(${approver1}) created`);
                    console.log(`Minute approver(${approver2}) created`);
                    console.log(`Second approver(${approver3}) created`);
                    await storeUsers(
                        BACKUP_FILE_NAME,
                        approver1,
                        approver2,
                        approver3,
                        createdUsers
                    );
                    return [approver1, approver2, approver3, createdUsers];
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
        const mints = mintHands(sdk, users, mintedDate, hourApprover);

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

        const shardId = 0;
        const hourType = hourAsset.assetType;
        const minuteType = minuteAsset.assetType;
        const secondType = secondAsset.assetType;

        let pendings: [string, Asset, Asset, Asset, Date, number][] = [];

        const transferFunction = async () => {
            const current = new Date();
            const inputs = shuffle<AssetTransferInput>([
                hourAsset.createTransferInput(),
                minuteAsset.createTransferInput(),
                secondAsset.createTransferInput()
            ]);
            const outputs = [
                sdk.core.createAssetTransferOutput({
                    assetType: hourType,
                    shardId,
                    quantity: 1,
                    recipient: users[current.getUTCHours()]
                }),
                sdk.core.createAssetTransferOutput({
                    assetType: minuteType,
                    shardId,
                    quantity: 1,
                    recipient: users[current.getUTCMinutes()]
                }),
                sdk.core.createAssetTransferOutput({
                    assetType: secondType,
                    shardId,
                    quantity: 1,
                    recipient: users[current.getUTCSeconds()]
                })
            ];
            const transfer = sdk.core.createTransferAssetTransaction({
                inputs,
                outputs,
                metadata: `Current time is ${current}`
            });
            await sdk.key.signTransactionInput(transfer, 0, { passphrase });
            await sdk.key.signTransactionInput(transfer, 1, { passphrase });
            await sdk.key.signTransactionInput(transfer, 2, { passphrase });
            const approval = await sdk.key.approveTransaction(transfer, {
                account: hourApprover,
                passphrase
            });
            (transfer as any).approvals = [`0x${approval}`];

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

            hourAsset = transfer.getTransferredAsset(0);
            minuteAsset = transfer.getTransferredAsset(1);
            secondAsset = transfer.getTransferredAsset(2);
            seq += 1;

            setTimeout(transferFunction, 1_000);
        };

        const resultFunction = async () => {
            while (pendings.length !== 0) {
                const hash = pendings[0][0];
                const result = await sdk.rpc.chain.getTransactionResult(hash);
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
                console.log(`Tx(${hash} sent at ${current} failed: ${reason}`);

                hourAsset = pendings[0][1];
                minuteAsset = pendings[0][2];
                secondAsset = pendings[0][3];
                seq = pendings[0][5];
                pendings = [];
            }

            setTimeout(resultFunction, 500);
        };
        setTimeout(resultFunction, 500);

        setTimeout(transferFunction, 1_000);
    })().catch(console.error);
}
