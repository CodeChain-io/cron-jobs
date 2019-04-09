import { SDK } from "codechain-sdk";
import * as chainErrors from "./Errors";
import { getConfig, sendNotice } from "./util";

const checkDeath = (() => {
  let prevBestBlockNumber = 0;
  return async (sdk: SDK) => {
    const currentBestBlockNumber = await sdk.rpc.chain.getBestBlockNumber();
    if (prevBestBlockNumber === currentBestBlockNumber) {
      sendNotice(new chainErrors.CodeChainDeath());
    }
    prevBestBlockNumber = currentBestBlockNumber;
  };
})();

async function checkView(sdk: SDK) {
  const viewAlertLevel = getConfig<number>("view_alert_level");
  const bestBlockNumber = await sdk.rpc.chain.getBestBlockNumber();
  const bestBlock = await sdk.rpc.chain.getBlock(bestBlockNumber);
  if (bestBlock) {
    const currentViewIdx = 1;
    const bestBlockSealField = bestBlock.seal;

    const currentView = bestBlockSealField[currentViewIdx][0];
    if (currentView >= viewAlertLevel) {
      sendNotice(new chainErrors.ViewTooHigh(currentView));
    }
  }
}

async function main() {
  const rpcUrl = getConfig<string>("rpc_url");
  const networkId = getConfig<string>("network_id");
  const sdk = new SDK({ server: rpcUrl, networkId });

  // 1 hour interval
  setInterval(checkDeath, 60 * 60 * 1000, sdk);
  setInterval(checkView, 1 * 1000, sdk);
}

main().catch(err => console.log(err));
