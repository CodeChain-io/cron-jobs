### Indexer Watcher
Checks whether the indexer is working properly.
* (error level) Sends a report when a ping request sent to the indexer fails.
* (error level) Sends a report if the indexer's synchronization status is off by more than 50 blocks from that of CodeChain’s.
* (error level) Sends a report if the block number of the CodeChain node that the indexer is watching hasn’t increased in the past hour.
* (info level) Sends a report when the indexer's synchronization status returns to normal.
* (info level) Sends a report when the CodeChain node that the indexer is watching is normal.
* (info level) Sends a report that notifies whether the indexer is running once a day.

| Key               | Description                                  | Example values              | Default value |
| ----------------- | -------------------------------------------- | --------------------------- | ------------- |
| NODE_ENV          | Use "production" to reduce mistakes          | production OR test          | null          |
| NETWORK_ID        | Network ID of connected CodeChain node       | cc, bc, tc                  | null          |
| INDEXER_URL       | CodeChain Indexer API URL                    | http://localhost:9001       | null          |
| SENDGRID_API_KEY  | An API Key for alarms                        | xxx                         | null          |
| SENDGRID_TO       | An email address that alarms will be sent to | codechain@example.com       | null          |
| SLACK_WEBHOOK_URL | A webhook URL for alarms                     | http://abcd.example.com/x/y | null          |
