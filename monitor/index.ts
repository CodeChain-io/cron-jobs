import { PlatformAddress, U64 } from "codechain-primitives";
import { SDK } from "codechain-sdk";
import { EmailClient } from "./EmailNotify";
import * as Notifications from "./Notification";
import { SlackNotification } from "./SlackNotify";
import {
  decodeBitsetField,
  decodeViewField,
  getConfig,
  unsetBitIndices
} from "./util";

const emailClient = new EmailClient();
type Notification = Notifications.Notification;

interface CheckSealFieldState {
  prevHasProblem: boolean;
  prevBestBlockNumber: number;
  sleepStreak: number[];
  viewAlertLevel: U64;
  sleepStreakAlertLevel: number;
}

function colorFromLevel(
  level: "error" | "warn" | "info"
): "danger" | "warning" | undefined {
  switch (level) {
    case "error":
      return "danger";
    case "warn":
      return "warning";
    default:
      return undefined;
  }
}

function sendNotice(error: Notification, targetEmail: string) {
  const color = colorFromLevel(error.level);
  if (color != null) {
    SlackNotification.instance.send({
      title: error.title,
      text: error.content,
      color
    });
  }
  emailClient
    .sendAnnouncement(
      targetEmail,
      `${error.title} - ${error.date.toISOString()}`,
      error.content
    )
    .catch(console.error);
}

const checkDeath = (() => {
  let prevBestBlockNumber = 0;
  return async (sdk: SDK, targetEmail: string) => {
    const currentBestBlockNumber = await sdk.rpc.chain.getBestBlockNumber();
    if (prevBestBlockNumber === currentBestBlockNumber) {
      sendNotice(new Notifications.CodeChainDeath(), targetEmail);
    }
    prevBestBlockNumber = currentBestBlockNumber;
  };
})();

let lastDate: number;
function checkDayChange(targetEmail: string) {
  const now = new Date();
  const nowDate = now.getUTCDate();
  if (lastDate === nowDate) {
    return;
  }
  lastDate = nowDate;
  sendNotice(new Notifications.DailyReport(), targetEmail);
}

function alertWhenViewTooHigh(
  bestBlockNumber: number,
  targetEmail: string,
  state: CheckSealFieldState,
  currentView: U64
) {
  if (currentView.gte(state.viewAlertLevel)) {
    sendNotice(
      new Notifications.ViewTooHigh(bestBlockNumber, currentView),
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
      new Notifications.NodeIsSleeping(bestBlockNumber, sleepingNodeIndices),
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
    sendNotice(new Notifications.AllNodesAwake(bestBlockNumber), targetEmail);
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
          new Notifications.NodeRecovered(bestBlockNumber, idx, sleepStreak),
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
      new Notifications.NodeIsSleeping(
        bestBlockNumber,
        longTermSleepingIndices,
        state.sleepStreakAlertLevel
      ),
      targetEmail
    );
  }
}

const PLATFORM_ADDRESS_TO_REGION_NAME: { [index: string]: string } = {};
const INDEX_TO_REGION_NAME: string[] = [];

function printSleepingNodes(
  author: PlatformAddress,
  selepingIndices: number[]
) {
  const authorRegionName = PLATFORM_ADDRESS_TO_REGION_NAME[author.toString()];
  const nodeIndicesToRegionName = selepingIndices.map(
    index => INDEX_TO_REGION_NAME[index]
  );

  console.log(
    `Author: ${authorRegionName} Sleepings: ${nodeIndicesToRegionName}`
  );
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
      const CURRENT_VIEW_IDX = 1;
      const PRECOMMIT_BITSET_IDX = 3;
      const bestBlockSealField = bestBlock.seal;

      const currentView = decodeViewField(bestBlockSealField[CURRENT_VIEW_IDX]);
      const precommitBitset = decodeBitsetField(
        bestBlockSealField[PRECOMMIT_BITSET_IDX]
      );
      const sleepingNodeIndices = unsetBitIndices(
        precommitBitset,
        validatorCount
      );

      printSleepingNodes(bestBlock.author, sleepingNodeIndices);

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
      sendNotice(
        new Notifications.GetBlockFailed(bestBlockNumber),
        targetEmail
      );
    }
  };
})();

async function main() {
  const rpcUrl = getConfig<string>("rpc_url");
  const networkId = getConfig<string>("network_id");
  const sdk = new SDK({ server: rpcUrl, networkId });
  const targetEmail = getConfig<string>("notification_target_email");

  lastDate = new Date().getUTCDate();

  // 10 minutes interval
  setInterval(checkDayChange, 10 * 60 * 1000, targetEmail);

  // 1 hour interval
  setInterval(checkDeath, 60 * 60 * 1000, sdk, targetEmail);
  setInterval(checkSealField, 3 * 1000, sdk, targetEmail);
}

main().catch(err => console.log(err));
