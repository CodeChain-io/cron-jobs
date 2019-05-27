import { getConfig } from "./util";

const networkId = getConfig<string>("network_id");

export interface Notification {
    readonly title: string;
    readonly content: string;
    readonly level: "error" | "warn" | "info";
    readonly date: Date;
}

export class IndexerPingFailed implements Notification {
    public readonly title: string;
    public readonly content: string;
    public readonly level = "error";
    public readonly date = new Date();

    public constructor() {
        const prefix = `[${this.level}][${networkId}][indexer-watcher]`;
        this.title = `${prefix} Indexer Ping Failed`;
        this.content = "Indexer is not responding a ping request";
    }
}

export class IndexerPingSuccess implements Notification {
    public readonly title: string;
    public readonly content: string;
    public readonly level = "info";
    public readonly date = new Date();

    public constructor() {
        const prefix = `[${this.level}][${networkId}][indexer-watcher]`;
        this.title = `${prefix} Indexer Ping Success`;
        this.content = "Indexer is responding a ping request";
    }
}

export class IndexerSyncTooSlow implements Notification {
    public readonly title: string;
    public readonly content: string;
    public readonly level = "error";
    public readonly date = new Date();

    public constructor(indexedBlockNumber: number, bestBlockNumber: number) {
        const prefix = `[${this.level}][${networkId}][indexer-watcher]`;
        this.title = `${prefix} Indexer Failed to follow the network`;
        this.content = `Indexer is too slow. Current indexed block number is ${indexedBlockNumber}, but the best block is ${bestBlockNumber}`;
    }
}

export class IndexerSyncNormalized implements Notification {
    public readonly title: string;
    public readonly content: string;
    public readonly level = "info";
    public readonly date = new Date();

    public constructor(indexedBlockNumber: number, bestBlockNumber: number) {
        const prefix = `[${this.level}][${networkId}][indexer-watcher]`;
        this.title = `${prefix} Indexer Followed the network`;
        this.content = `Indexer followed the network. Current indexed block number is ${indexedBlockNumber}, but the best block is ${bestBlockNumber}`;
    }
}

export class IndexerCodeChainNotSyncing implements Notification {
    public readonly title: string;
    public readonly content: string;
    public readonly level = "error";
    public readonly date = new Date();

    public constructor(blockNumber: number) {
        const prefix = `[${this.level}][${networkId}][indexer-watcher]`;
        this.title = `${prefix} Indexer's CodeChain is not syncing`;
        this.content = `The CodeChain Instance used in the indexer's block number is not changed in an hour. Current block number is ${blockNumber}`;
    }
}

export class IndexerCodeChainSyncing implements Notification {
    public readonly title: string;
    public readonly content: string;
    public readonly level = "info";
    public readonly date = new Date();

    public constructor(blockNumber: number) {
        const prefix = `[${this.level}][${networkId}][indexer-watcher]`;
        this.title = `${prefix} Indexer's CodeChain is syncing`;
        this.content = `The CodeChain Instance used in the indexer is syncing well now. Current block number is ${blockNumber}`;
    }
}

export class DailyReport implements Notification {
    public readonly title: string;
    public readonly content: string;
    public readonly level = "info";
    public readonly date = new Date();

    public constructor(firstBlockNumber: number | "unknown", lastBlockNumber: number) {
        const prefix = `[${this.level}][${networkId}][indexer-watcher]`;
        this.title = `${prefix} is working`;
        this.content = `The Indexer Watcher is working without problem. Yesterday's first block number was ${firstBlockNumber} and last block number was ${lastBlockNumber}.`;
    }
}

export class InternalError implements Notification {
    public readonly title: string;
    public readonly content: string;
    public readonly level = "warn";
    public readonly date = new Date();

    public constructor(error: string) {
        const prefix = `[${this.level}][${networkId}][indexer-watcher]`;
        this.title = `${prefix} Indexer Watcher failed`;
        this.content = `Indexer Watcher failed with this error: ${error}`;
    }
}
