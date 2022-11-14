import { concat } from "ethers/lib/utils";
import { memoryOperand, MemoryType, op } from "./interpreter";
import { Opcode } from "./ops/allStandardOps";

export const afterBlockNumberSource = (constant: number): Uint8Array => {
  // prettier-ignore
  return concat([
    // (BLOCK_NUMBER blockNumberSub1 gt)
      op(Opcode.BLOCK_NUMBER),
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, constant)),
    op(Opcode.GREATER_THAN),
  ]);
};

export const betweenBlockNumbersSource = (
  vStart: Uint8Array,
  vEnd: Uint8Array
): Uint8Array => {
  // prettier-ignore
  return concat([
        op(Opcode.BLOCK_NUMBER),
        vStart,
      op(Opcode.GREATER_THAN),
        op(Opcode.BLOCK_NUMBER),
        vEnd,
      op(Opcode.LESS_THAN),
    op(Opcode.EVERY, 2),
  ])
};
