import { concat } from "ethers/lib/utils";
import { memoryOperand, MemoryType, op } from "./interpreter";
import { Opcode } from "./ops/allStandardOps";

export const afterBlockNumberSource = (constant: number): Uint8Array => {
  // prettier-ignore
  return concat([
    // (BLOCK_NUMBER blockNumberSub1 gt)
      op(Opcode.blockNumber),
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, constant)),
    op(Opcode.greaterThan),
  ]);
};

export const betweenBlockNumbersSource = (
  vStart: Uint8Array,
  vEnd: Uint8Array
): Uint8Array => {
  // prettier-ignore
  return concat([
        op(Opcode.blockNumber),
        vStart,
      op(Opcode.greaterThan),
        op(Opcode.blockNumber),
        vEnd,
      op(Opcode.lessThan),
    op(Opcode.every, 2),
  ])
};
