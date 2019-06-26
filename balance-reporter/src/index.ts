import { U64 } from "codechain-primitives";
import Rpc from "codechain-rpc";
import { createEmail } from "./Email";

type balanceInfo = {
    address: string;
    balance: U64;
};

function getConfig(field: string, defaultVal?: string): string {
    const c = process.env[field];
    if (c == null) {
        if (defaultVal == null) {
            throw new Error(`${field} is not specified`);
        }
        return defaultVal;
    }
    return c;
}

const rpcUrl = getConfig("RPC_URL");
const sendgridApiKey = getConfig("SENDGRID_API_KEY");
const sendgridTo = getConfig("SENDGRID_TO");
const minAllowedBalance = new U64(getConfig("MIN_BALANCE"));
const maxAllowedBalance = new U64(getConfig("MAX_BALANCE"));

const rpc = new Rpc(rpcUrl);
const email = createEmail({
    tag: `[mainnet][balance-reporter]`,
    sendgridApiKey,
    to: sendgridTo,
});

const targetAddresses: string[] = process.argv.slice(2);

function outOfRange(target: U64, min: U64, max: U64) {
    return target.lt(min) || target.gt(max);
}

async function getCCCBalances(
    addresses: string[],
    blockNumber: number,
): Promise<Array<balanceInfo>> {
    const balances = await Promise.all(
        addresses.map(address => rpc.chain.getBalance({ address, blockNumber })),
    );
    const result = [];
    for (let i = 0; i < addresses.length; i++) {
        const inst = balances[i];
        if (inst != null) {
            result.push({
                address: addresses[i],
                balance: new U64(inst),
            });
        }
    }
    return result;
}

function toReportMessage(prefix: string, infos: balanceInfo[], blockNumber: number): string {
    const infosString = infos
        .map(info => `<li> ${info.address} : ${info.balance} </li>`)
        .join("<br />\r\n");
    return `<p>${prefix}, block number: ${blockNumber}</p>
    <ul>${infosString}</ul>
    `;
}

async function main() {
    let lastReportDate = new Date().getUTCDate();
    let lastCheckedBlockNumber = await rpc.chain.getBestBlockNumber();
    let lastCheckedBalances: balanceInfo[] = [];

    setInterval(() => {
        const nowDate = new Date().getUTCDate();
        if (nowDate !== lastReportDate && lastCheckedBalances.length > 0) {
            const message = toReportMessage(
                "Daily report",
                lastCheckedBalances,
                lastCheckedBlockNumber,
            );
            email.sendInfo("daily report", message);
        }
        lastReportDate = nowDate;
    }, 60 * 1000); // 1 minute interval

    setInterval(async () => {
        lastCheckedBlockNumber = await rpc.chain.getBestBlockNumber()!;
        lastCheckedBalances = await getCCCBalances(targetAddresses, lastCheckedBlockNumber);
        const reportingTarget = Array.from(lastCheckedBalances).filter(info =>
            outOfRange(info.balance, minAllowedBalance, maxAllowedBalance),
        );
        if (reportingTarget.length > 0) {
            const message = toReportMessage(
                "Balances are out of range",
                reportingTarget,
                lastCheckedBlockNumber,
            );
            email.sendWarning(message);
        }
    }, 60 * 1000 * 5); // 5 miniute interval
}

main().catch(error => {
    console.log({ error });
    email.sendError(error.message);
});
