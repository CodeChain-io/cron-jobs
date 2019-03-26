import { SDK } from "codechain-sdk";
import { calculateSeq, sendTransaction } from "./sendTx";
import { wait } from "./wait";

export async function isActiveAccount(
    sdk: SDK,
    account: string
): Promise<boolean> {
    const balance = await sdk.rpc.chain.getBalance(account);
    if (!balance.isEqualTo(0)) {
        return true;
    }

    const seq = await sdk.rpc.chain.getSeq(account);
    return seq !== 0;
}

export async function activateApprovers(
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
