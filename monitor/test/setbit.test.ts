import { expect } from "chai";
import { unsetBitIndices } from "../util";

describe("BitSet interpretation test", () => {
  it("Convert_basic", () => {
    const validatorCount = 8;
    const bitSetEntry = 0b10101010;
    const bitSet = [bitSetEntry];

    expect(unsetBitIndices(bitSet, validatorCount)).to.deep.equal([0, 2, 4, 6]);
  });

  it("Convert_multi_entries", () => {
    const validatorCount = 30;
    const bitSetEntry1 = 0b11001010;
    const bitSetEntry2 = 0b01010011;
    const bitSetEntry3 = 0b11111111;
    const bitSetEntry4 = 0b00111100;

    const bitSet = [bitSetEntry1, bitSetEntry2, bitSetEntry3, bitSetEntry4];

    expect(unsetBitIndices(bitSet, validatorCount)).to.deep.equal([
      0, 2, 4, 5, 10, 11, 13, 15, 24, 25
    ]);
  });
});
