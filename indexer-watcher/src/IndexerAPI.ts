import * as rp from "request-promise-native";

interface SyncStatusResult {
    codechainBestBlockNumber: number;
    indexerBestBlockNumber: number;
}

export interface IndexerAPI {
    ping: () => Promise<void>;
    syncStatus: () => Promise<SyncStatusResult>;
}

export class IndexerAPIImpl {
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

    public syncStatus = async (): Promise<SyncStatusResult> => {
        return await rp({
            uri: `${this.url}/api/status/sync`,
            json: true,
        });
    };
}

export class TestIndexerAPI {
    public pingError: Error | null = null;
    public ping = async () => {
        if (this.pingError) {
            throw this.pingError;
        }
        return Promise.resolve();
    };

    public syncStatusResult: SyncStatusResult = {
        codechainBestBlockNumber: 0,
        indexerBestBlockNumber: 0,
    };
    public syncStatus = async () => {
        return Promise.resolve(this.syncStatusResult);
    };
}
