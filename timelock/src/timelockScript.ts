import * as assert from "assert";
import { H160, Script, Timelock } from "codechain-sdk/lib/core/classes";
import { blake160 } from "codechain-sdk/lib/utils";
import * as _ from "lodash";

export function getLockScript(timelockType: number | Timelock["type"]): Buffer {
    let timelockNumber: number;
    if (_.isNumber(timelockType)) {
        assert.ok(
            timelockType > 0 && timelockType < 5,
            `TimelockType ${timelockType}`
        );
        timelockNumber = timelockType;
    } else if (timelockType === "block") {
        timelockNumber = 1;
    } else if (timelockType === "blockAge") {
        timelockNumber = 2;
    } else if (timelockType === "time") {
        timelockNumber = 3;
    } else if (timelockType === "timeAge") {
        timelockNumber = 4;
    } else {
        throw new Error(`Invalid timelockType ${timelockType}`);
    }

    const { CHKTIMELOCK } = Script.Opcode;
    return Buffer.from([CHKTIMELOCK, timelockNumber]);
}

export function getLockScriptHash(timelockType: number): H160 {
    const lockScript = getLockScript(timelockType);
    return H160.ensure(blake160(lockScript));
}

export function getAllLockScriptHashes(): H160[] {
    return [
        getLockScriptHash(1),
        getLockScriptHash(2),
        getLockScriptHash(3),
        getLockScriptHash(4)
    ];
}

export function getUnlockScript(): Buffer {
    return Buffer.from([]);
}
