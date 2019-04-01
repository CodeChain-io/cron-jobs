import { SDK } from "codechain-sdk";
import { AssetManager } from "./src/AssetManager";
import { AssetTransferTxGenerator } from "./src/AssetTransferTxGenerator";
import { FlawGenerator } from "./src/FlawGenerator";
import { OrderGenerator } from "./src/OrderGenerator";
import { SlackNotification } from "./src/Slacknotify";
import Helper, { asyncSleep, getConfig, randRange } from "./src/util";

async function main() {
    const rpcUrl = getConfig<string>("rpc_url");
    const networkId = getConfig<string>("network_id");

    const sdk = new SDK({ server: rpcUrl, networkId });
    const keyStore = await sdk.key.createLocalKeyStore();

    const helper = new Helper(sdk, keyStore);
    await helper.setRegularKey();
    const numberOfAssets = 10;
    const assetManager = new AssetManager(helper, numberOfAssets);
    await assetManager.init();

    const orderGenerator = new OrderGenerator(helper, assetManager);
    const assetTransferTxGenerator = new AssetTransferTxGenerator(
        helper,
        assetManager
    );
    const flawGenerator = new FlawGenerator(helper, assetManager);

    while (true) {
        let polluted = false;
        let lastSentTracker: string = "";
        try {
            // for (let i = 0; i < numberOfAssets; i++) {
            //     console.log(
            //         assetManager.wallets[i].asset.outPoint.quantity.toString()
            //     );
            // }
            assetManager.shuffleBox();

            console.log("");
            if (Math.random() < 0.02) {
                await helper.setRegularKey();
            }

            if (Math.random() > 0.9) {
                console.log("Entangled orders' transaction is airdropped");
                const entangleCnt = randRange(2, numberOfAssets);
                const idxFee =
                    Math.random() > 0.5
                        ? assetManager.idxBox[numberOfAssets - 1]
                        : undefined;
                if (idxFee) {
                    console.log("Fee introduced");
                }
                const entangledOrders = orderGenerator.generateNEntangledOrders(
                    entangleCnt,
                    idxFee
                );

                if (Math.random() < 0.1) {
                    polluted = true;
                    console.log("Santa's order was polluted by the air");
                    entangledOrders[0] = flawGenerator.polluteOrder(
                        entangledOrders[0]
                    );
                }

                let assetTransferTxGenerated = assetTransferTxGenerator.generateAssetTransferTxEntangled(
                    entangledOrders,
                    idxFee
                );

                if (Math.random() < 0.1) {
                    polluted = true;
                    console.log("Santa's transaction was polluted by the air");
                    assetTransferTxGenerated = flawGenerator.polluteTransaction(
                        assetTransferTxGenerated
                    );
                }

                for (let i = 0; i < entangleCnt; i++) {
                    await helper.signTransactionInput(
                        assetTransferTxGenerated,
                        i
                    );
                }
                if (idxFee) {
                    await helper.signTransactionInput(
                        assetTransferTxGenerated,
                        entangleCnt
                    );
                }

                const result = await helper.sendAssetTransaction(
                    assetTransferTxGenerated
                );

                lastSentTracker = assetTransferTxGenerated.tracker().toString();
                console.log(result, lastSentTracker);

                await assetManager.renewWalletsAfterTx(
                    assetTransferTxGenerated,
                    assetManager.idxBox[0]
                );

                await asyncSleep(5000);
            } else {
                const [idxFrom, idxTo, idxFeeCandidate] = [
                    assetManager.idxBox[0],
                    assetManager.idxBox[1],
                    assetManager.idxBox[numberOfAssets - 1]
                ];
                const idxFee =
                    Math.random() > 0.5 ? idxFeeCandidate : undefined;
                if (idxFee) {
                    console.log("Fee introduced");
                }
                let orderGenerated = orderGenerator.generateOrder({
                    idxFrom,
                    idxTo,
                    idxFee
                });

                if (Math.random() < 0.1) {
                    polluted = true;
                    console.log("Santa's order was polluted by the air");
                    orderGenerated = flawGenerator.polluteOrder(orderGenerated);
                }

                const dualOrder =
                    Math.random() < 0.5
                        ? undefined
                        : orderGenerator.generateDualOrder(
                              orderGenerated,
                              idxTo
                          );
                if (dualOrder) {
                    console.log("Dual order generated");
                }
                let assetTransferTxGenerated = assetTransferTxGenerator.generateAssetTransferTx(
                    {
                        idxFrom,
                        idxTo,
                        idxFee
                    },
                    orderGenerated,
                    dualOrder
                );

                if (Math.random() < 0.1) {
                    polluted = true;
                    console.log("Santa's transaction was polluted by the air");
                    assetTransferTxGenerated = flawGenerator.polluteTransaction(
                        assetTransferTxGenerated
                    );
                }

                await helper.signTransactionInput(assetTransferTxGenerated, 0);
                await helper.signTransactionInput(assetTransferTxGenerated, 1);
                if (idxFee) {
                    await helper.signTransactionInput(
                        assetTransferTxGenerated,
                        2
                    );
                }
                const result = await helper.sendAssetTransaction(
                    assetTransferTxGenerated
                );

                lastSentTracker = assetTransferTxGenerated.tracker().toString();
                console.log(result, lastSentTracker);

                await assetManager.renewWalletsAfterTx(
                    assetTransferTxGenerated,
                    idxFrom
                );
                await asyncSleep(5000);

                if (Math.random() < 0.5) {
                    console.log(
                        "Transaction filling a partially filled order was given away."
                    );
                    const prevSpent = assetTransferTxGenerated.orders()[0]
                        .spentQuantity;
                    const prevSpentDual = dualOrder
                        ? assetTransferTxGenerated.orders()[1].spentQuantity
                        : 0;
                    // console.log(prevSpent.toString())
                    // console.log(assetManager.wallets[idxFrom].asset.quantity.toString());
                    let orderConsumed = orderGenerated.consume(prevSpent);

                    if (Math.random() < 0.1) {
                        polluted = true;
                        console.log("Santa's order was polluted by the air");
                        orderConsumed = flawGenerator.polluteOrder(
                            orderConsumed
                        );
                    }

                    const dualOrderConsumed = dualOrder
                        ? dualOrder.consume(prevSpentDual)
                        : undefined;
                    let assetTransferTxContinue = assetTransferTxGenerator.generateAssetTransferTx(
                        {
                            idxFrom,
                            idxTo,
                            idxFee
                        },
                        orderConsumed,
                        dualOrderConsumed
                    );

                    if (Math.random() < 0.1) {
                        polluted = true;
                        console.log(
                            "Santa's transaction was polluted by the air"
                        );
                        assetTransferTxContinue = flawGenerator.polluteTransaction(
                            assetTransferTxContinue
                        );
                    }

                    await helper.signTransactionInput(
                        assetTransferTxContinue,
                        0
                    );
                    await helper.signTransactionInput(
                        assetTransferTxContinue,
                        1
                    );

                    const result2 = await helper.sendAssetTransaction(
                        assetTransferTxContinue
                    );

                    lastSentTracker = assetTransferTxContinue
                        .tracker()
                        .toString();
                    console.log(result2, lastSentTracker);

                    await assetManager.renewWalletsAfterTx(
                        assetTransferTxContinue,
                        idxFrom
                    );
                    await asyncSleep(5000);
                }
            }
            if (polluted) {
                return SlackNotification.instance.sendError(
                    `problematic transaction ${lastSentTracker}`
                );
            }
        } catch (e) {
            if (!polluted) {
                return SlackNotification.instance.sendError(e);
            }
            console.log(e);
        }
    }
}

main();
