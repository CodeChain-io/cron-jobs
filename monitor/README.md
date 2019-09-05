### Monitor
Monitors the overall block generation process of the codechain network after every block.
* (error level) Checks if CodeChain is alive every hour (whether blocks were created for the past hour or not).
* (error level) Sends a report if the requested block could not be obtained.
* (warn level) Sends an alert when the consensus process is not going smoothly and is higher than View's preset View alert level (currently set to 5).
* (warn level) Sends a report if the observing node sees nodes that did not participate in votes.
* (warn level) Sends a report if the observing node sees that a node has not been signed for N consecutive blocks (currently 5).
* (info level) Sends a report when nodes that have slept in succession (votes not being delivered) return to normal voting.
* (info level) Sends a report if all nodes are working fine and return to a state of agreement.
* (info level) A notification is sent everyday, reporting that CodeChain is in working order.