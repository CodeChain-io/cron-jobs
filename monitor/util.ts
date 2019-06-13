import { U64 } from "codechain-primitives";
import * as RLP from "rlp";

export function getConfig(field: string): string {
  const c = process.env[field];
  if (c == null) {
    throw new Error(`${field} is not specified`);
  }
  return c;
}

export function haveConfig(field: string): boolean {
  return process.env[field] != null;
}

export function unsetBitIndices(
  bitset: number[],
  validatorCount: number
): number[] {
  const indices: number[] = [];
  for (let i = 0; i < validatorCount; i++) {
    const arrayIndex = Math.floor(i / 8);
    const bitIndex = i % 8;

    if (!((bitset[arrayIndex] >> bitIndex) & 1)) {
      indices.push(i);
    }
  }
  return indices;
}

export function decodeViewField(encodedView: number[]): U64 {
  const buffer = Buffer.from(encodedView);
  return U64.fromBytes(buffer);
}

export function decodeBitsetField(encodedBitSet: number[]): number[] {
  const buffer = Buffer.from(encodedBitSet);
  const decoded = RLP.decode(buffer);

  return Array.from(decoded.values());
}
