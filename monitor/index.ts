import { SDK } from "codechain-sdk";
import * as chainErrors from "./Errors";
import { getConfig, sendNotice } from "./util";

async function main() {
  const rpcUrl = getConfig<string>("rpc_url");
  const networkId = getConfig<string>("network_id");
  const sdk = new SDK({ server: rpcUrl, networkId });

  let prevBestBlockNumber = 0;

  while (true) {
    await new Promise(resolve => setTimeout(resolve, 60 * 60 * 1000));
    const currentBestBlockNumber = await sdk.rpc.chain.getBestBlockNumber();
    if (prevBestBlockNumber === currentBestBlockNumber) {
      sendNotice(chainErrors.codechainDeath);
    }
    prevBestBlockNumber = currentBestBlockNumber;
  }
}

main().catch(err => console.log(err));
