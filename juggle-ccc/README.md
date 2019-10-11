### Juggle CCC
Juggle CCC is not a monitoring tool, but reports whether the CCC Juggling is working properly and shows the status of the accounts currently being juggled.
* (info level) Report the amount of CCC retained and how much you used as a fee once per day.

### Environment variables

| Key               | Description                                            | Example values                              | Default value |
| ----------------- | ------------------------------------------------------ | ------------------------------------------- | ------------- |
| NETWORK_ID        | Network ID of connected CodeChain node                 | cc, bc, tc                                  | null          |
| RPC_URL           | CodeChain HTTP JSON RPC URL                            | http://localhost:8080                       | null          |
| LEFT_ADDRESS      | A platform address of the left account                 | bccqy7aeyc0qryehxgtx9y4vthhg7u95rad2ymlya7j | null          |
| LEFT_PASSPHRASE   | A passphrase that is used to encrypt the left account  | xxxx                                        | null          |
| RIGHT_ADDRESS     | A platform address of the right account                | bccqyp5ragyz8v4mha22asnrxvy6dt2hc7yecylqy6d | null          |
| RIGHT_PASSPHRASE  | A passphrase that is used to encrypt the right account | xxxx                                        | null          |
| SENDGRID_API_KEY  | An API Key for alarms                                  | xxx                                         | null          |
| SENDGRID_TO       | An email address that alarms will be sent to           | codechain@example.com                       | null          |
| SLACK_WEBHOOK_URL | A webhook URL for alarms                               | http://abcd.example.com/x/y                 | null          |
