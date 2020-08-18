import { expect } from "chai";
import { AssetAddress } from "codechain-primitives";
import { SDK } from "codechain-sdk";
import { KeyStore } from "codechain-sdk/lib/key/KeyStore";
import * as config from "config";
import "mocha";
import { tmpdir } from "os";
import * as randomstring from "randomstring";
import { mintHands } from "./mintHands";

const networkId = config.get<string>("network_id");

export const faucetSecret =
    "ede1d4ccb4ec9a8bbbae9a13db3f4a7b56ea04189be86ac3a6a439d9a0a1addd";
export const faucetAccointId = SDK.util.getAccountIdFromPrivate(faucetSecret); // 6fe64ffa3a46c074226457c90ccb32dc06ccced1
export const faucetAddress = SDK.Core.classes.PlatformAddress.fromAccountId(
    faucetAccointId,
    { networkId }
); // tccq9h7vnl68frvqapzv3tujrxtxtwqdnxw6yamrrgd

const dbPath = `${tmpdir()}/${randomstring.generate({
    length: 12,
    charset: "alphabetic"
})}`;

const rpcUrl = config.get<string>("rpc_url");
const sdk = new SDK({ server: rpcUrl, networkId });

describe("Clock hands", async function() {
    let keyStore: KeyStore;
    let payer: string;
    const passphrase = "pass";
    let users: string[];

    before(async function() {
        keyStore = await sdk.key.createLocalKeyStore(dbPath);
        payer = (await sdk.key.createPlatformAddress({ keyStore, passphrase }))
            .value;

        const seq = await sdk.rpc.chain.getSeq(faucetAddress);
        const pay = sdk.core
            .createPayTransaction({ recipient: payer, quantity: 1000 })
            .sign({ secret: faucetSecret, seq, fee: 10 });
        await sdk.rpc.chain.sendSignedTransaction(pay);

        users = [];
        this.timeout(60_000);
        for (let i = 0; i < 60; i += 1) {
            const user = await sdk.key.createAssetAddress({
                type: "P2PKH",
                passphrase
            });
            users.push(user.value);
        }
    });

    it("Check owners", async function() {
        const shardId = 0;
        const date = new Date();
        const hourApprover = (
            await sdk.key.createPlatformAddress({
                keyStore,
                passphrase
            })
        ).value;
        const minuteApprover = (
            await sdk.key.createPlatformAddress({
                keyStore,
                passphrase
            })
        ).value;
        const secondApprover = (
            await sdk.key.createPlatformAddress({
                keyStore,
                passphrase
            })
        ).value;
        const [hour, minute, second] = mintHands(
            sdk,
            shardId,
            users,
            date,
            hourApprover,
            minuteApprover,
            secondApprover
        );

        const hourOwner = Buffer.from(
            AssetAddress.fromString(
                users[date.getUTCHours()]
            ).payload.toString(),
            "hex"
        );
        expect(hour.getMintedAsset().parameters).deep.equal([hourOwner]);

        const minuteOwner = Buffer.from(
            AssetAddress.fromString(
                users[date.getUTCMinutes()]
            ).payload.toString(),
            "hex"
        );
        expect(minute.getMintedAsset().parameters).deep.equal([minuteOwner]);

        const secondOwner = Buffer.from(
            AssetAddress.fromString(
                users[date.getUTCSeconds()]
            ).payload.toString(),
            "hex"
        );
        expect(second.getMintedAsset().parameters).deep.equal([secondOwner]);
    });
});
