import { expect } from "chai";
import { U64 } from "codechain-primitives/lib";
import { decodeBitsetField, decodeViewField, unsetBitIndices } from "../util";

describe("BitSet interpretation test", () => {
  it("convert_basic", () => {
    const validatorCount = 8;
    const bitSetEntry = 0b10101010;
    const bitSet = [bitSetEntry];

    expect(unsetBitIndices(bitSet, validatorCount)).to.deep.equal([0, 2, 4, 6]);
  });

  it("convert_multi_entries", () => {
    const validatorCount = 30;
    const bitSetEntry1 = 0b11001010;
    const bitSetEntry2 = 0b01010011;
    const bitSetEntry3 = 0b11111111;
    const bitSetEntry4 = 0b00111100;

    const bitSet = [bitSetEntry1, bitSetEntry2, bitSetEntry3, bitSetEntry4];

    expect(unsetBitIndices(bitSet, validatorCount)).to.deep.equal([
      0,
      2,
      4,
      5,
      10,
      11,
      13,
      15,
      24,
      25
    ]);
  });
});

describe("Seal fields decode test", () => {
  it("decode_view_field1", () => {
    const encodedViewField = [0x80];
    const oracle = new U64(0);
    expect(decodeViewField(encodedViewField).eq(oracle)).to.equal(true);
  });

  it("decode_view_field2", () => {
    const encodedViewField = [0x82, 0x04, 0x00];
    const oracle = new U64(1024);
    expect(decodeViewField(encodedViewField).eq(oracle)).to.equal(true);
  });

  it("decode_bitset_field", () => {
    const encodedBitsetField = [
      184,
      100,
      255,
      255,
      255,
      63,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ];
    const decodedBitsetField = decodeBitsetField(encodedBitsetField);
    const validatorCount = 30;
    expect(unsetBitIndices(decodedBitsetField, validatorCount)).to.deep.equal(
      []
    );
  });
});
