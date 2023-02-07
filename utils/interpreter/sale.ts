import { concat } from "ethers/lib/utils";
import { memoryOperand, MemoryType, op } from "./interpreter";
import { Opcode } from "./ops/allStandardOps";

/**
 * @public
 * Builds source which returns true if a block number is after `vBlock`
 *
 * @param vBlock op which returns a block number
 * @returns interpreter source
 */
export const afterBlockNumberSource = (vBlock: number): Uint8Array => {
  // prettier-ignore
  return concat([
    // (BLOCK_NUMBER blockNumberSub1 gt)
      op(Opcode.blockNumber),
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, vBlock)),
    op(Opcode.greaterThan),
  ]);
};

/**
 * @public
 * Builds source which returns true if a block number is between blocks `vStart` and `vEnd`
 *
 * @param vStart op which returns larger block number
 * @param vEnd op which returns smaller block number
 * @returns interpreter source
 */
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
