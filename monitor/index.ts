import { PlatformAddress, U64 } from "codechain-primitives";
import Rpc from "codechain-rpc";
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
  if (error.level === "error") {
    emailClient
      .sendAnnouncement(
        targetEmail,
        `${error.title} - ${error.date.toISOString()}`,
        error.content
      )
      .catch(console.error);
  }
}

function sendStart(targetEmail: string, networkId: string) {
  const message = `[${networkId}] monitor start`;
  SlackNotification.instance.send({
    title: message,
    text: "",
    color: "good"
  });
  emailClient
    .sendAnnouncement(targetEmail, message, message)
    .catch(console.error);
}

const checkDeath = (() => {
  let prevBestBlockNumber = 0;
  return async (rpc: Rpc, targetEmail: string, networkId: string) => {
    const currentBestBlockNumber = await rpc.chain.getBestBlockNumber();
    if (prevBestBlockNumber === currentBestBlockNumber) {
      sendNotice(new Notifications.CodeChainDeath(networkId), targetEmail);
    }
    prevBestBlockNumber = currentBestBlockNumber;
  };
})();

let lastDate: number;
function checkDayChange(targetEmail: string, networkId: string) {
  const now = new Date();
  const nowDate = now.getUTCDate();
  if (lastDate === nowDate) {
    return;
  }
  lastDate = nowDate;
  sendNotice(new Notifications.DailyReport(networkId), targetEmail);
}

function alertWhenViewTooHigh(
  networkId: string,
  bestBlockNumber: number,
  targetEmail: string,
  state: CheckSealFieldState,
  currentView: U64
) {
  if (currentView.gte(state.viewAlertLevel)) {
    sendNotice(
      new Notifications.ViewTooHigh(networkId, bestBlockNumber, currentView),
      targetEmail
    );
  }
}

function alertWhenMultipleNodesSleeping(
  networkId: string,
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
        networkId,
        bestBlockNumber,
        validatorAddressesInString
      ),
      targetEmail
    );
  }
}

function notifyWhenAllNodesWakeUp(
  networkId: string,
  bestBlockNumber: number,
  targetEmail: string,
  state: CheckSealFieldState,
  sleepingValidators: PlatformAddress[]
) {
  const allNodesNowAwake =
    sleepingValidators.length === 0 && state.prevHasProblem;
  if (allNodesNowAwake) {
    state.prevHasProblem = false;
    sendNotice(
      new Notifications.AllNodesAwake(networkId, bestBlockNumber),
      targetEmail
    );
  }
}

function notifyWhenNodesSleepingLongOrRecovered(
  networkId: string,
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
              networkId,
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
        networkId,
        bestBlockNumber,
        longTermSleepingAddresses,
        state.sleepStreakAlertLevel
      ),
      targetEmail
    );
  }
}

async function queryValidators(
  rpc: Rpc,
  blockNumber: number
): Promise<PlatformAddress[]> {
  const addresses: ReadonlyArray<string> = (await rpc.call(
    { method: "chain_getPossibleAuthors" },
    blockNumber
  )).result;
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
  return async (rpc: Rpc, targetEmail: string, networkId: string) => {
    const bestBlockNumber = await rpc.chain.getBestBlockNumber();
    if (state.prevBestBlockNumber === bestBlockNumber) {
      return;
    }
    state.prevBestBlockNumber = bestBlockNumber;
    const bestBlock = await rpc.chain.getBlockByNumber({
      blockNumber: bestBlockNumber
    });
    if (bestBlock) {
      const CURRENT_VIEW_IDX = 1;
      const PRECOMMIT_BITSET_IDX = 3;
      const bestBlockSealField = (bestBlock as any).seal;

      const currentView = decodeViewField(bestBlockSealField[CURRENT_VIEW_IDX]);
      const precommitBitset = decodeBitsetField(
        bestBlockSealField[PRECOMMIT_BITSET_IDX]
      );
      const validatorsOfPrevBlock = await queryValidators(
        rpc,
        bestBlockNumber - 1
      );
      const sleepingValidators: PlatformAddress[] = calculateSleepingValidators(
        validatorsOfPrevBlock,
        precommitBitset
      );

      alertWhenViewTooHigh(
        networkId,
        bestBlockNumber,
        targetEmail,
        state,
        currentView
      );
      alertWhenMultipleNodesSleeping(
        networkId,
        bestBlockNumber,
        targetEmail,
        state,
        sleepingValidators
      );
      notifyWhenNodesSleepingLongOrRecovered(
        networkId,
        bestBlockNumber,
        targetEmail,
        state,
        sleepingValidators
      );
      notifyWhenAllNodesWakeUp(
        networkId,
        bestBlockNumber,
        targetEmail,
        state,
        sleepingValidators
      );
    } else {
      sendNotice(
        new Notifications.GetBlockFailed(networkId, bestBlockNumber),
        targetEmail
      );
    }
  };
})();

async function main() {
  const rpcUrl = getConfig("RPC_URL");
  const rpc = new Rpc(rpcUrl);
  const targetEmail = getConfig("SENDGRID_TO");

  const networkId = await rpc.chain.getNetworkId();

  lastDate = new Date().getUTCDate();

  sendStart(targetEmail, networkId);

  // 10 minutes interval
  setInterval(checkDayChange, 10 * 60 * 1000, targetEmail, networkId);

  // 1 hour interval
  setInterval(checkDeath, 60 * 60 * 1000, rpc, targetEmail, networkId);
  setInterval(checkSealField, 3 * 1000, rpc, targetEmail, networkId);
}

process.on("unhandledRejection", error => {
  const rpcUrl = getConfig("RPC_URL");
  const rpc = new Rpc(rpcUrl);
  const targetEmail = getConfig("SENDGRID_TO");
  rpc.chain
    .getNetworkId()
    .then(networkId => {
      sendNotice(
        new Notifications.UnhandledRejection(networkId, error.message),
        targetEmail
      );
    })
    .catch(err => console.error(err.message));
  console.error("unhandledRejection", error.message);
});

main().catch(err => console.log(err));
