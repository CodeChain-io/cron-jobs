import { SDK } from "codechain-sdk";
import * as _ from "lodash";
import { AssetManager } from "./src/AssetManager";
import { AssetTransferTxGenerator } from "./src/AssetTransferTxGenerator";
import { OrderGenerator } from "./src/OrderGenerator";
import Helper, { getConfig, randRange } from "./src/util";

function asyncSleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getTwoDistinctIdx(range: number) {
    const idxFrom = randRange(0, range - 1);
    let idxTo;
    do {
        idxTo = randRange(0, range - 1);
    } while (idxTo === idxFrom);

    return [idxFrom, idxTo];
}

async function main() {
    const rpcUrl = getConfig<string>("rpc_url");
    const networkId = getConfig<string>("network_id");

    const sdk = new SDK({ server: rpcUrl, networkId });
    const keyStore = await sdk.key.createLocalKeyStore();

    const helper = new Helper(sdk, keyStore);
    const numberOfAssets = 5;
    const assetManager = new AssetManager(helper, numberOfAssets);
    await assetManager.init();

    const orderGenerator = new OrderGenerator(helper, assetManager);
    const assetTransferTxGenerator = new AssetTransferTxGenerator(
        helper,
        assetManager
    );

    while (true) {
        try {
            for (let i = 0; i < numberOfAssets; i++) {
                console.log(
                    assetManager.wallets[i].asset.outPoint.quantity.toString()
                );
            }
            const [idxFrom, idxTo] = getTwoDistinctIdx(numberOfAssets);
            const orderGenerated = orderGenerator.generateOrder({
                idxFrom,
                idxTo
            });
            const assetTransferTxGenerated = assetTransferTxGenerator.generateAssetTransferTx(
                {
                    idxFrom,
                    idxTo
                },
                orderGenerated
            );

            await helper.signTransactionInput(assetTransferTxGenerated, 0);
            await helper.signTransactionInput(assetTransferTxGenerated, 1);
            const result = await helper.sendAssetTransaction(
                assetTransferTxGenerated
            );

            console.log(result);
            if (_.isEqual(result, [true])) {
                await assetManager.renewWalletsAfterTx(
                    assetTransferTxGenerated
                );
            }
            await asyncSleep(1000);
        } catch (e) {
            console.log(e);
        }
    }
}

main();
