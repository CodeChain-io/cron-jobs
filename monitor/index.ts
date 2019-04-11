import { SDK } from "codechain-sdk";
import * as chainErrors from "./Alert";
import { getConfig, unsetBitIndices } from "./util";
import { SlackNotification } from "./SlackNotify";
import { CodeChainAlert } from "./Alert";

const targetEmail = "devop@kodebox.io";
const emailClient = new EmailClient("");
import { EmailClient } from "./EmailNotify";

async function sendNotice(error: CodeChainAlert) {
  SlackNotification.instance.sendError(error.title + "\n" + error.content);
  await emailClient.sendAnnouncement(targetEmail, error.title, error.content);
}

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

const checkSealField = (() => {
  let prevAllSet = true;
  return async (sdk: SDK) => {
    const viewAlertLevel = getConfig<number>("view_alert_level");
    const bestBlockNumber = await sdk.rpc.chain.getBestBlockNumber();
    const bestBlock = await sdk.rpc.chain.getBlock(bestBlockNumber);
    if (bestBlock) {
      // FIXME: When dynatmic validator is deployed, get validator count dynamically.
      const validatorCount = 30;

      const currentViewIdx = 1;
      const precommitBitsetIdx = 3;
      const bestBlockSealField = bestBlock.seal;

      const currentView = bestBlockSealField[currentViewIdx][0];
      if (currentView >= viewAlertLevel) {
        sendNotice(new chainErrors.ViewTooHigh(currentView));
      }

      const precommitBitset = bestBlockSealField[precommitBitsetIdx];
      const sleepingNodeIndices = unsetBitIndices(
        precommitBitset,
        validatorCount
      );

      const someNodesStartSleeping =
        sleepingNodeIndices.length !== 0 && prevAllSet === true;
      const allNodesNowAwake =
        sleepingNodeIndices.length === 0 && prevAllSet === false;

      if (someNodesStartSleeping) {
        prevAllSet = false;
        sendNotice(new chainErrors.NodeIsSleeping(sleepingNodeIndices));
      } else if (allNodesNowAwake) {
        prevAllSet = true;
        sendNotice(new chainErrors.AllNodesAwake());
      }
    } else {
      sendNotice(new chainErrors.GetBlockFailed(bestBlockNumber));
    }
  };
})();

async function main() {
  const rpcUrl = getConfig<string>("rpc_url");
  const networkId = getConfig<string>("network_id");
  const sdk = new SDK({ server: rpcUrl, networkId });

  // 1 hour interval
  setInterval(checkDeath, 60 * 60 * 1000, sdk);
  setInterval(checkSealField, 3 * 1000, sdk);
}

main().catch(err => console.log(err));
