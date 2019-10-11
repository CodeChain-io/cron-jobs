### Monitor
Monitors the overall block generation process of the codechain network after every block.
1. (error level) Checks if CodeChain is alive every hour (whether blocks were created for the past hour or not).
2. (error level) Sends a report if the requested block could not be obtained.
3. (warn level) Sends an alert when the consensus process is not going smoothly and is higher than View's preset View alert level (currently set to 5).
4. (warn level) Sends a report if the observing node sees nodes that did not participate in votes.
5. (warn level) Sends a report if the observing node sees that a node has not been signed for N consecutive blocks (currently 5).
6. (info level) Sends a report when nodes that have slept in succession (votes not being delivered) return to normal voting.
7. (info level) Sends a report if all nodes are working fine and return to a state of agreement.
8. (info level) A notification is sent everyday, reporting that CodeChain is in working order.

### Environment variables

| Key                      | Description                                  | Example values              | Default value                                                               |
| ------------------------ | -------------------------------------------- | --------------------------- | --------------------------------------------------------------------------- |
| NODE_ENV                 | Use "production" to reduce mistakes          | production OR test          | null                                                                        |
| RPC_URL                  | CodeChain HTTP JSON RPC URL                  | http://localhost:8080       | https://corgi-rpc.codechain.io in corgi https://rpc.codechain.io in mainnet |
| VIEW_ALERT_LEVEL         | See above alarm number 3                     | 3                           | null                                                                        |
| SLEEP_STREAK_ALERT_LEVEL | See above alarm number 6                     | 5                           | null                                                                        |
| SENDGRID_API_KEY         | An API Key for alarms                        | xxx                         | null                                                                        |
| SENDGRID_TO              | An email address that alarms will be sent to | codechain@example.com       | null                                                                        |
| SLACK_WEBHOOK_URL        | A webhook URL for alarms                     | http://abcd.example.com/x/y | null                                                                        |
