import { SDK } from "codechain-sdk";
import { TransferAsset } from "codechain-sdk/lib/core/transaction/TransferAsset";

export async function approve(
    sdk: SDK,
    transfer: TransferAsset,
    account: string,
    passphrase: string
) {
    const approval = await sdk.key.approveTransaction(transfer, {
        account,
        passphrase
    });
    transfer.addApproval(`0x${approval}`);
}
