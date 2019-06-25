import { toHex } from "codechain-primitives";

const rlp = require("rlp");

export default function createKey(...params: any[]): string {
    return `0x${toHex(rlp.encode(params))}`;
}
