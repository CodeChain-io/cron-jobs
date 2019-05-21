import * as rp from "request-promise-native";

export class IndexerAPI {
    private url: string;
    public constructor(url: string) {
        this.url = url;
    }

    public ping = async () => {
        await rp({
            uri: `${this.url}/api/ping`,
            json: true,
        });
    };

    public syncStatus = async (): Promise<{
        codechainBestBlockNumber: number;
        indexerBestBlockNumber: number;
    }> => {
        return await rp({
            uri: `${this.url}/api/status/sync`,
            json: true,
        });
    };
}
