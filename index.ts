import { SDK } from "codechain-sdk";
import * as config from "config";

if (require.main === module) {
    const rpcUrl = config.get<string>("rpc_url")!;
    const networkId = config.get<string>("network_id")!;
    const sdk = new SDK({ server: rpcUrl, networkId });
}
