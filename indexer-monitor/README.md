### Indexer Watcher
Checks whether the indexer is working properly.
* (error level) Sends a report when a ping request sent to the indexer fails.
* (error level) Sends a report if the indexer's synchronization status is off by more than 50 blocks from that of CodeChain’s.
* (error level) Sends a report if the block number of the CodeChain node that the indexer is watching hasn’t increased in the past hour.
* (info level) Sends a report when the indexer's synchronization status returns to normal.
* (info level) Sends a report when the CodeChain node that the indexer is watching is normal.
* (info level) Sends a report that notifies whether the indexer is running once a day.
