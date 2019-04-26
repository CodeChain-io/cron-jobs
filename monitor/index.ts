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

interface CheckSealFieldState {
  prevHasProblem: boolean;
  prevBestBlockNumber: number;
  sleepStreak: number[];
  viewAlertLevel: U64;
  sleepStreakAlertLevel: number;
}

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

function alertWhenViewTooHigh(
  bestBlockNumber: number,
  targetEmail: string,
  state: CheckSealFieldState,
  currentView: U64
) {
  if (currentView.gte(state.viewAlertLevel)) {
    sendNotice(
      new chainErrors.ViewTooHigh(bestBlockNumber, currentView),
      targetEmail
    );
  }
}

function alertWhenMultipleNodesSleeping(
  bestBlockNumber: number,
  targetEmail: string,
  state: CheckSealFieldState,
  sleepingNodeIndices: number[]
) {
  const multipleNodesSleeping = sleepingNodeIndices.length > 1;
  if (multipleNodesSleeping) {
    state.prevHasProblem = true;
    sendNotice(
      new chainErrors.NodeIsSleeping(bestBlockNumber, sleepingNodeIndices),
      targetEmail
    );
  }
}

function notifyWhenAllNodesWakeUp(
  bestBlockNumber: number,
  targetEmail: string,
  state: CheckSealFieldState,
  sleepingNodeIndices: number[]
) {
  const allNodesNowAwake =
    sleepingNodeIndices.length === 0 && state.prevHasProblem;
  if (allNodesNowAwake) {
    state.prevHasProblem = false;
    sendNotice(new chainErrors.AllNodesAwake(bestBlockNumber), targetEmail);
  }
}

function notifyWhenNodesSleepingLongOrRecovered(
  bestBlockNumber: number,
  targetEmail: string,
  state: CheckSealFieldState,
  sleepingNodeIndices: number[]
) {
  const longTermSleepingIndices = [];
  for (let idx = 0; idx < state.sleepStreak.length; idx++) {
    if (sleepingNodeIndices.includes(idx)) {
      state.sleepStreak[idx] += 1;
    } else {
      const sleepStreak = state.sleepStreak[idx];
      const prevProblematic = sleepStreak >= state.sleepStreakAlertLevel;
      if (prevProblematic) {
        sendNotice(
          new chainErrors.NodeRecovered(bestBlockNumber, idx, sleepStreak),
          targetEmail
        );
      }
      state.sleepStreak[idx] = 0;
    }
    if (state.sleepStreak[idx] === state.sleepStreakAlertLevel) {
      longTermSleepingIndices.push(idx);
    }
  }

  if (longTermSleepingIndices.length > 0) {
    state.prevHasProblem = true;
    sendNotice(
      new chainErrors.NodeIsSleeping(
        bestBlockNumber,
        longTermSleepingIndices,
        state.sleepStreakAlertLevel
      ),
      targetEmail
    );
  }
}

const checkSealField = (() => {
  const validatorCount = 30;
  const state = {
    prevHasProblem: false,
    prevBestBlockNumber: 0,
    sleepStreak: Array(validatorCount).fill(0),
    viewAlertLevel: new U64(getConfig<number>("view_alert_level")),
    sleepStreakAlertLevel: getConfig<number>("sleep_streak_alert_level")
  };
  return async (sdk: SDK, targetEmail: string) => {
    const bestBlockNumber = await sdk.rpc.chain.getBestBlockNumber();
    if (state.prevBestBlockNumber === bestBlockNumber) {
      return;
    }
    state.prevBestBlockNumber = bestBlockNumber;
    const bestBlock = await sdk.rpc.chain.getBlock(bestBlockNumber);
    if (bestBlock) {
      // FIXME: When dynatmic validator is deployed, get validator count dynamically.
      const currentViewIdx = 1;
      const precommitBitsetIdx = 3;
      const bestBlockSealField = bestBlock.seal;

      const currentView = decodeViewField(bestBlockSealField[currentViewIdx]);
      const precommitBitset = decodeBitsetField(
        bestBlockSealField[precommitBitsetIdx]
      );
      const sleepingNodeIndices = unsetBitIndices(
        precommitBitset,
        validatorCount
      );

      alertWhenViewTooHigh(bestBlockNumber, targetEmail, state, currentView);
      alertWhenMultipleNodesSleeping(
        bestBlockNumber,
        targetEmail,
        state,
        sleepingNodeIndices
      );
      notifyWhenNodesSleepingLongOrRecovered(
        bestBlockNumber,
        targetEmail,
        state,
        sleepingNodeIndices
      );
      notifyWhenAllNodesWakeUp(
        bestBlockNumber,
        targetEmail,
        state,
        sleepingNodeIndices
      );
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
