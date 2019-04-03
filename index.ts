import { SDK } from "codechain-sdk";
import { EmailClient } from "./EmailNotify";
import { SlackNotification } from "./SlackNotify";
import { getConfig } from "./util";

async function main() {
  const rpcUrl = getConfig<string>("rpc_url");
  const networkId = getConfig<string>("network_id");

  const sdk = new SDK({ server: rpcUrl, networkId });
  const emailClient = new EmailClient("");

  const targetEmail = "engine@kodebox.io";
  const title = "[CodeChain Death Confirmation]";
  const content = "CodeChain didn't renew the best block number for 1 hour.";

  let prevBestBlockNumber = 0;

  while (true) {
    await new Promise(resolve => setTimeout(resolve, 360));
    const currentBestBlockNumber = await sdk.rpc.chain.getBestBlockNumber();
    if (prevBestBlockNumber === currentBestBlockNumber) {
      SlackNotification.instance.sendError(content);
      await emailClient.sendAnnouncement(targetEmail, title, content);
      return;
    }
    prevBestBlockNumber = currentBestBlockNumber;
  }
}

main().catch(err => console.log(err));
