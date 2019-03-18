import { SDK } from "codechain-sdk";
import * as config from "config";
import { createUsers, loadUsers, storeUsers } from "./src/users";

if (require.main === module) {
    const rpcUrl = config.get<string>("rpc_url")!;
    const networkId = config.get<string>("network_id")!;
    const passphrase = config.get<string>("passphrase");
    const sdk = new SDK({ server: rpcUrl, networkId });
    (async () => {
        const users = await loadUsers(".users").catch((err: Error) => {
            console.error(err.message);
            return createUsers(sdk, passphrase).then(createdUsers => {
                storeUsers(".users", createdUsers);
                return createdUsers;
            });
        });
    })().catch(console.error);
}
