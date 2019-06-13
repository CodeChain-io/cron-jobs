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
  sleepStreak: { [index: string]: number };
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
  sleepingValidators: PlatformAddress[]
) {
  const multipleNodesSleeping = sleepingValidators.length > 1;
  if (multipleNodesSleeping) {
    state.prevHasProblem = true;
    const validatorAddressesInString = sleepingValidators.map(address =>
      address.toString()
    );
    sendNotice(
      new Notifications.NodeIsSleeping(
        bestBlockNumber,
        validatorAddressesInString
      ),
      targetEmail
    );
  }
}

function notifyWhenAllNodesWakeUp(
  bestBlockNumber: number,
  targetEmail: string,
  state: CheckSealFieldState,
  sleepingValidators: PlatformAddress[]
) {
  const allNodesNowAwake =
    sleepingValidators.length === 0 && state.prevHasProblem;
  if (allNodesNowAwake) {
    state.prevHasProblem = false;
    sendNotice(new Notifications.AllNodesAwake(bestBlockNumber), targetEmail);
  }
}

function notifyWhenNodesSleepingLongOrRecovered(
  bestBlockNumber: number,
  targetEmail: string,
  state: CheckSealFieldState,
  sleepingValidators: PlatformAddress[]
) {
  const longTermSleepingAddresses: string[] = [];

  const newSleepStreakState: { [index: string]: number } = {};

  for (const sleepingValidator of sleepingValidators) {
    newSleepStreakState[sleepingValidator.toString()] = 1;
  }

  for (const address in state.sleepStreak) {
    if (state.sleepStreak.hasOwnProperty(address)) {
      const prevSleepStreak = state.sleepStreak[address];
      if (newSleepStreakState[address] === 1) {
        newSleepStreakState[address] += prevSleepStreak;
        if (newSleepStreakState[address] === state.sleepStreakAlertLevel) {
          longTermSleepingAddresses.push(address);
        }
      } else {
        const prevProblematic = prevSleepStreak >= state.sleepStreakAlertLevel;
        if (prevProblematic) {
          sendNotice(
            new Notifications.NodeRecovered(
              bestBlockNumber,
              address,
              prevSleepStreak
            ),
            targetEmail
          );
        }
      }
    }
  }

  state.sleepStreak = newSleepStreakState;

  if (longTermSleepingAddresses.length > 0) {
    state.prevHasProblem = true;
    sendNotice(
      new Notifications.NodeIsSleeping(
        bestBlockNumber,
        longTermSleepingAddresses,
        state.sleepStreakAlertLevel
      ),
      targetEmail
    );
  }
}

async function queryValidators(
  sdk: SDK,
  blockNumber: number
): Promise<PlatformAddress[]> {
  const addresses = await sdk.rpc.sendRpcRequest("chain_getPossibleAuthors", [
    blockNumber
  ]);
  return addresses.map((address: string) => PlatformAddress.ensure(address));
}

function calculateSleepingValidators(
  validatorAddresses: PlatformAddress[],
  precommitBitset: number[]
): PlatformAddress[] {
  const sleepingValidatorIndexes: number[] = unsetBitIndices(
    precommitBitset,
    validatorAddresses.length
  );

  return sleepingValidatorIndexes.map(index => validatorAddresses[index]);
}

const checkSealField = (() => {
  const state = {
    prevHasProblem: false,
    prevBestBlockNumber: 0,
    sleepStreak: {},
    viewAlertLevel: new U64(getConfig("VIEW_ALERT_LEVEL")),
    sleepStreakAlertLevel: parseInt(getConfig("SLEEP_STREAK_ALERT_LEVEL"), 10)
  };
  return async (sdk: SDK, targetEmail: string) => {
    const bestBlockNumber = await sdk.rpc.chain.getBestBlockNumber();
    if (state.prevBestBlockNumber === bestBlockNumber) {
      return;
    }
    state.prevBestBlockNumber = bestBlockNumber;
    const bestBlock = await sdk.rpc.chain.getBlock(bestBlockNumber);
    if (bestBlock) {
      const CURRENT_VIEW_IDX = 1;
      const PRECOMMIT_BITSET_IDX = 3;
      const bestBlockSealField = bestBlock.seal;

      const currentView = decodeViewField(bestBlockSealField[CURRENT_VIEW_IDX]);
      const precommitBitset = decodeBitsetField(
        bestBlockSealField[PRECOMMIT_BITSET_IDX]
      );
      const validatorsAtTheBlock = await queryValidators(sdk, bestBlockNumber);
      const sleepingValidators: PlatformAddress[] = calculateSleepingValidators(
        validatorsAtTheBlock,
        precommitBitset
      );

      alertWhenViewTooHigh(bestBlockNumber, targetEmail, state, currentView);
      alertWhenMultipleNodesSleeping(
        bestBlockNumber,
        targetEmail,
        state,
        sleepingValidators
      );
      notifyWhenNodesSleepingLongOrRecovered(
        bestBlockNumber,
        targetEmail,
        state,
        sleepingValidators
      );
      notifyWhenAllNodesWakeUp(
        bestBlockNumber,
        targetEmail,
        state,
        sleepingValidators
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
  const rpcUrl = getConfig("RPC_URL");
  const networkId = getConfig("NETWORK_ID");
  const sdk = new SDK({ server: rpcUrl, networkId });
  const targetEmail = getConfig("NOTIFICATION_TARGET_EMAIL");

  lastDate = new Date().getUTCDate();

  // 10 minutes interval
  setInterval(checkDayChange, 10 * 60 * 1000, targetEmail);

  // 1 hour interval
  setInterval(checkDeath, 60 * 60 * 1000, sdk, targetEmail);
  setInterval(checkSealField, 3 * 1000, sdk, targetEmail);
}

main().catch(err => console.log(err));
