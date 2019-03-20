import { SDK } from "codechain-sdk";
import * as _ from "lodash";
import { AssetManager } from "./src/AssetManager";
import { AssetTransferTxGenerator } from "./src/AssetTransferTxGenerator";
import { OrderGenerator } from "./src/OrderGenerator";
import Helper, { getConfig } from "./src/util";

function asyncSleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
            // for (let i = 0; i < numberOfAssets; i++) {
            //     console.log(
            //         assetManager.wallets[i].asset.outPoint.quantity.toString()
            //     );
            // }
            assetManager.shuffleBox();
            const [idxFrom, idxTo, idxFeeCandidate] = [
                assetManager.idxBox[0],
                assetManager.idxBox[1],
                assetManager.idxBox[numberOfAssets - 1]
            ];
            const idxFee = Math.random() > 0.5 ? idxFeeCandidate : undefined;
            if (idxFee) {
                console.log("Fee introduced");
            }
            const orderGenerated = orderGenerator.generateOrder({
                idxFrom,
                idxTo,
                idxFee
            });
            const dualOrder =
                Math.random() < 0.5
                    ? undefined
                    : orderGenerator.generateDualOrder(orderGenerated, idxTo);
            if (dualOrder) {
                console.log("Dual order generated");
            }
            const assetTransferTxGenerated = assetTransferTxGenerator.generateAssetTransferTx(
                {
                    idxFrom,
                    idxTo,
                    idxFee
                },
                orderGenerated,
                dualOrder
            );

            await helper.signTransactionInput(assetTransferTxGenerated, 0);
            await helper.signTransactionInput(assetTransferTxGenerated, 1);
            if (idxFee) {
                await helper.signTransactionInput(assetTransferTxGenerated, 2);
            }
            const result = await helper.sendAssetTransaction(
                assetTransferTxGenerated
            );

            console.log(result);
            if (_.isEqual(result, [true])) {
                await assetManager.renewWalletsAfterTx(
                    assetTransferTxGenerated,
                    idxFrom
                );
            }
            await asyncSleep(1000);

            // continuously fill the previous partially filled order.
            // sometimes fails because of the divisibility of remaining assetQuantityFrom.
            if (Math.random() < 0.5) {
                console.log(
                    "Transaction filling partially filled order was given away."
                );
                const prevSpent = assetTransferTxGenerated.orders()[0]
                    .spentQuantity;
                const prevSpentDual = dualOrder
                    ? assetTransferTxGenerated.orders()[1].spentQuantity
                    : 0;
                // console.log(prevSpent.toString())
                // console.log(assetManager.wallets[idxFrom].asset.quantity.toString());
                const orderConsumed = orderGenerated.consume(prevSpent);
                const dualOrderConsumed = dualOrder
                    ? dualOrder.consume(prevSpentDual)
                    : undefined;
                const assetTransferTxContinue = assetTransferTxGenerator.generateAssetTransferTx(
                    {
                        idxFrom,
                        idxTo,
                        idxFee
                    },
                    orderConsumed,
                    dualOrderConsumed
                );

                await helper.signTransactionInput(assetTransferTxContinue, 1);
                const result2 = await helper.sendAssetTransaction(
                    assetTransferTxContinue
                );

                console.log(result2);
                if (_.isEqual(result2, [true])) {
                    await assetManager.renewWalletsAfterTx(
                        assetTransferTxContinue,
                        idxFrom
                    );
                }
                await asyncSleep(1000);
            }
        } catch (e) {
            console.log(e);
        }
    }
}

main();
