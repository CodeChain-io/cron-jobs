### Fee Monitor
In a dynamic validator environment, minimum fees are collected and shared amongst stakeholders, and the remaining express fee is distributed amongst validators. The Fee Monitor is a tool that checks whether the process just mentioned is in accordance with the specification.
* (warn level) Each block is checked to see if the CCC difference between the previous and current block matches the spec logic calculated by the fee monitor itself.

### Environment variables

| Key               | Description                                                | Example values              | Default value                                                               |
| ----------------- | ---------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------- |
| SERVER            | The name of the network                                    | beagle OR corgi OR mainnet  | corgi                                                                       |
| RPC_URL           | CodeChain HTTP JSON RPC URL                                | http://localhost:8080       | https://corgi-rpc.codechain.io in corgi https://rpc.codechain.io in mainnet |
| SLACK_WEBHOOK_URL | A webhook URL for alarms                                   | http://abcd.example.com/x/y | null                                                                        |
| SENDGRID_TO       | An email address that alarms will be sent to               | codechain@example.com       | null                                                                        |
| SENDGRID_API_KEY  | An API Key for alarms                                      | xxx                         | null                                                                        |
| BLOCK_NUMBER      | Start monitoring from $BLOCK_NUMBER                        | 3                           | null                                                                        |
| LOOK_BEHIND       | Start monitoring from the best block number - $LOOK_BEHIND | 3                           | null                                                                        |
