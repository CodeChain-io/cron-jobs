import * as config from "config";

export function getConfig<T>(field: string): T {
  const c = config.get<T>(field);
  if (c == null) {
    throw new Error(`${field} is not specified`);
  }
  return c;
}

export function haveConfig(field: string): boolean {
  return !!config.has(field) && config.get(field) != null;
}

export function unsetBitIndices(
  bitset: number[],
  validatorCount: number
): number[] {
  const indices: number[] = [];
  for (let i = 0; i < validatorCount; i++) {
    const arrayIndex = Math.floor(i / 8);
    const bitIndex = i % 8;

    if (~((bitset[arrayIndex] >> bitIndex) & 1)) {
      indices.push(i);
    }
  }
  return indices;
}
