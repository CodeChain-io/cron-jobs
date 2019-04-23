import { U64 } from "codechain-primitives";
import { SDK } from "codechain-sdk";
import * as chainErrors from "./Alert";
import { CodeChainAlert } from "./Alert";
import { EmailClient } from "./EmailNotify";
import { SlackNotification } from "./SlackNotify";
import {
  decodeBitsetField,
  decodeViewField,
  getConfig,
  unsetBitIndices
} from "./util";

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
  let prevHasProblem = false;
  let prevBestBlockNumber = 0;
  const validatorCount = 30;
  const errorStreak = Array(validatorCount).fill(0);
  
  return async (sdk: SDK, targetEmail: string) => {
    const viewAlertLevel = new U64(getConfig<number>("view_alert_level"));
    const errorStreakAlertLevel = getConfig<number>("error_streak_alert_level");
    const bestBlockNumber = await sdk.rpc.chain.getBestBlockNumber();

    if (prevBestBlockNumber === bestBlockNumber) {
      return;
    }
    prevBestBlockNumber = bestBlockNumber;
    const bestBlock = await sdk.rpc.chain.getBlock(bestBlockNumber);
    if (bestBlock) {
      // FIXME: When dynatmic validator is deployed, get validator count dynamically.
      const currentViewIdx = 1;
      const precommitBitsetIdx = 3;
      const bestBlockSealField = bestBlock.seal;

      const currentView = decodeViewField(bestBlockSealField[currentViewIdx]);
      if (currentView.gte(viewAlertLevel)) {
        sendNotice(
          new chainErrors.ViewTooHigh(bestBlockNumber, currentView),
          targetEmail
        );
      }

      const precommitBitset = decodeBitsetField(
        bestBlockSealField[precommitBitsetIdx]
      );
      const sleepingNodeIndices = unsetBitIndices(
        precommitBitset,
        validatorCount
      );

      const multipleNodesSleeping = sleepingNodeIndices.length > 1;
      if (multipleNodesSleeping) {
        prevHasProblem = true;
        sendNotice(
          new chainErrors.NodeIsSleeping(bestBlockNumber, sleepingNodeIndices),
          targetEmail
        );
      }

      for (let idx = 0; idx < errorStreak.length; idx++) {
        if (sleepingNodeIndices.includes(idx)) {
          errorStreak[idx] += 1;
        } else {
          errorStreak[idx] = 0;
        }
      }
      const longTermSleepingIndices = [];
      for (let idx = 0; idx < errorStreak.length; idx++) {
        if (errorStreak[idx] >= errorStreakAlertLevel) {
          longTermSleepingIndices.push(idx);
        }
      }
      if (longTermSleepingIndices.length > 0) {
        prevHasProblem = true;
        sendNotice(
          new chainErrors.NodeIsSleeping(
            bestBlockNumber,
            longTermSleepingIndices,
            errorStreakAlertLevel
          ),
          targetEmail
        );
        longTermSleepingIndices.forEach(idx => {
          errorStreak[idx] = 0;
        });
      }

      const allNodesNowAwake =
        sleepingNodeIndices.length === 0 && prevHasProblem;
      if (allNodesNowAwake) {
        prevHasProblem = false;
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
