### Auto self nominate

Automatically send nominate transactions.

### Environment variables

| Key                             | Description                                                                           | Example values                              | Default value |
| ------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------- | ------------- |
| NETWORK_ID                      | Network ID of connected CodeChain node                                                | cc, bc, tc                                  | null          |
| RPC_URL                         | CodeChain HTTP JSON RPC URL                                                           | http://localhost:8080                       | null          |
| NEED_NOMINATION_UNDER_TERM_LEFT | Send nomination if the nomination will end after NEED_NOMINATION_UNDER_TERM_LEFT term | 2                                           | 2             |
| ACCOUNT_ADDRESS                 | Platform address of sender                                                            | bccqy7aeyc0qryehxgtx9y4vthhg7u95rad2ymlya7j | null          |
| PASSPHRASE                      | A passphrase that is used to encrypt the ACCOUNT_ADDRESS                              | xxxx                                        | null          |
| METADATA                        | Metadata will be writen in a nomination transaction                                   | Some advertisement text                     | null          |
| TARGET_DEPOSIT                  | The goal deposit CCC value of the ACCOUNT_ADDRESS                                     | 10000000                                    | null          |
| INTERVAL_SECONDS                | This script runs every INTERVAL_SECONDS                                               | 600                                         | 0             |
| SLACK_WEBHOOK_URL               | A webhook URL for alarms                                                              | http://abcd.example.com/x/y                 | null          |
| SENDGRID_TO                     | An email address that alarms will be sent to                                          | codechain@example.com                       | null          |
| SENDGRID_API_KEY                | An API Key for alarms                                                                 | xxx                                         | null          |
