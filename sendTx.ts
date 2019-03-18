import { H256 } from "codechain-primitives";
import { SDK } from "codechain-sdk";
import { Transaction } from "codechain-sdk/lib/core/Transaction";
import { MintAsset } from "codechain-sdk/lib/core/transaction/MintAsset";

export async function calculateSeq(sdk: SDK, payer: string): Promise<number> {
    const prevSeq = await sdk.rpc.chain.getSeq(payer);
    const pendingTransactions = await sdk.rpc.chain.getPendingTransactions();
    const payerTransactions = pendingTransactions.transactions.filter(
        transaction =>
            transaction.getSignerAccountId().value ===
            SDK.Core.classes.PlatformAddress.ensure(payer).accountId.value
    );

    if (payerTransactions.length === 0) {
        return await sdk.rpc.chain.getSeq(payer);
    }
    return prevSeq + payerTransactions.length;
}

export async function sendTransaction(
    sdk: SDK,
    account: string,
    passphrase: string,
    seq: number,
    transaction: Transaction
): Promise<H256> {
    const signedTransaction = await sdk.key.signTransaction(transaction, {
        account,
        fee: 10,
        seq,
        passphrase
    });
    return await sdk.rpc.chain.sendSignedTransaction(signedTransaction);
}

export async function sendMints(
    sdk: SDK,
    mints: MintAsset[],
    params: {
        payer: string;
        passphrase: string;
    }
): Promise<[string[], number]> {
    const { payer, passphrase } = params;

    const seq = await calculateSeq(sdk, payer);

    const hashes = [];
    for (let i = 0; i < mints.length; i += 1) {
        hashes.push((await sendTransaction(sdk, payer, passphrase, seq + i, mints[i])).value);
    }

    return [hashes, seq + mints.length];
}
