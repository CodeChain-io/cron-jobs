import { U64 } from "codechain-primitives";
import { SDK } from "codechain-sdk";
import * as chainErrors from "./Alert";
import { CodeChainAlert } from "./Alert";
import { EmailClient } from "./EmailNotify";
import { SlackNotification } from "./SlackNotify";
import { getConfig, unsetBitIndices } from "./util";

const emailClient = new EmailClient("");

async function sendNotice(error: CodeChainAlert, targetEmail: string) {
  SlackNotification.instance.sendError(error.title + "\n" + error.content);
  await emailClient.sendAnnouncement(targetEmail, error.title, error.content);
}

const checkDeath = (() => {
  let prevBestBlockNumber = 0;
  return async (sdk: SDK, targetEmail: string) => {
    const currentBestBlockNumber = await sdk.rpc.chain.getBestBlockNumber();
    if (prevBestBlockNumber === currentBestBlockNumber) {
      sendNotice(new chainErrors.CodeChainDeath(), targetEmail);
    }
    prevBestBlockNumber = currentBestBlockNumber;
  };
})();

const checkSealField = (() => {
  let prevAllSet = true;
  return async (sdk: SDK, targetEmail: string) => {
    const viewAlertLevel = new U64(getConfig<number>("view_alert_level"));
    const bestBlockNumber = await sdk.rpc.chain.getBestBlockNumber();
    const bestBlock = await sdk.rpc.chain.getBlock(bestBlockNumber);
    if (bestBlock) {
      // FIXME: When dynatmic validator is deployed, get validator count dynamically.
      const validatorCount = 30;

      const currentViewIdx = 1;
      const precommitBitsetIdx = 3;
      const bestBlockSealField = bestBlock.seal;

      const currentView = new U64(bestBlockSealField[currentViewIdx][0]);
      if (currentView.gte(viewAlertLevel)) {
        sendNotice(
          new chainErrors.ViewTooHigh(bestBlockNumber, currentView),
          targetEmail
        );
      }

      const precommitBitset = bestBlockSealField[precommitBitsetIdx];
      const sleepingNodeIndices = unsetBitIndices(
        precommitBitset,
        validatorCount
      );

      const someNodesStartSleeping =
        sleepingNodeIndices.length !== 0 && prevAllSet;
      const allNodesNowAwake = sleepingNodeIndices.length === 0 && !prevAllSet;

      if (someNodesStartSleeping) {
        prevAllSet = false;
        sendNotice(
          new chainErrors.NodeIsSleeping(bestBlockNumber, sleepingNodeIndices),
          targetEmail
        );
      } else if (allNodesNowAwake) {
        prevAllSet = true;
        sendNotice(new chainErrors.AllNodesAwake(bestBlockNumber), targetEmail);
      }
    } else {
      sendNotice(new chainErrors.GetBlockFailed(bestBlockNumber), targetEmail);
    }
  };
})();

async function main() {
  const rpcUrl = getConfig<string>("rpc_url");
  const networkId = getConfig<string>("network_id");
  const sdk = new SDK({ server: rpcUrl, networkId });
  const targetEmail = getConfig<string>("notification_target_email");

  // 1 hour interval
  setInterval(checkDeath, 60 * 60 * 1000, sdk, targetEmail);
  setInterval(checkSealField, 3 * 1000, sdk, targetEmail);
}

main().catch(err => console.log(err));
