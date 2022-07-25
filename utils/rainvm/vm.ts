import { BytesLike } from "ethers";
import { concat, Hexable, hexlify, zeroPad } from "ethers/lib/utils";

export enum MemoryType {
  Stack,
  Constant,
  Context,
}

export enum Debug {
  StatePacked,
  Stack,
  StackIndex,
}

export enum selectLteLogic {
  every,
  any,
}

export enum selectLteMode {
  min,
  max,
  first,
}

/**
 * Converts a value to raw bytes representation. Assumes `value` is less than or equal to 1 byte, unless a desired `bytesLength` is specified.
 *
 * @param value - value to convert to raw bytes format
 * @param bytesLength - (defaults to 1) number of bytes to left pad if `value` doesn't completely fill the desired amount of memory. Will throw `InvalidArgument` error if value already exceeds bytes length.
 * @returns {Uint8Array} - raw bytes representation
 */
export function bytify(
  value: number | BytesLike | Hexable,
  bytesLength = 1
): BytesLike {
  return zeroPad(hexlify(value), bytesLength);
}

/**
 * Converts an opcode and operand to bytes, and returns their concatenation.
 * @param code - the opcode
 * @param erand - the operand, currently limited to 1 byte (defaults to 0)
 */
export function op(
  code: number,
  erand: number | BytesLike | Hexable = 0
): Uint8Array {
  return concat([bytify(code), bytify(erand)]);
}

export function memoryOperand(type: number, offset: number): number {
  return (offset << 2) + type;
}

/**
 * Constructs the operand for RainVM's `zipmap` opcode by packing 3 numbers into a single byte. All parameters use zero-based counting i.e. an `fnSize` of 0 means to allocate one element (32 bytes) on the stack to define your functions, while an `fnSize` of 3 means to allocate all four elements (4 * 32 bytes) on the stack.
 *
 * @param sourceIndex - index of function source in `immutableSourceConfig.sources`
 * @param loopSize - number of times to subdivide vals, reduces uint size but allows for more vals (range 0-7)
 * @param valSize - number of vals in outer stack (range 0-7)
 */
export function zipmapSize(
  sourceIndex: number,
  loopSize: number,
  valSize: number
): number {
  // CallSize(
  //   op_.val & 0x07,      // 00000111
  //   op_.val >> 3 & 0x03, // 00011000
  //   op_.val >> 5 & 0x07  // 11100000
  // )

  if (sourceIndex < 0 || sourceIndex > 7) {
    throw new Error("Invalid fnSize");
  } else if (loopSize < 0 || loopSize > 3) {
    throw new Error("Invalid loopSize");
  } else if (valSize < 0 || valSize > 7) {
    throw new Error("Invalid valSize");
  }
  let callSize = valSize;
  callSize <<= 2;
  callSize += loopSize;
  callSize <<= 3;
  callSize += sourceIndex;
  return callSize;
}

export function selectLte(logic: number, mode: number, length: number): number {
  let lte = logic;
  lte <<= 2;
  lte += mode;
  lte <<= 5;
  lte += length;
  return lte;
}

export function valOperand(index: number, forwardedVals?: boolean): number {
  //   op_.val & 0x7F, //     01111111
  //   op_.val & 0x80, //     10000000

  if (index < 0 || index > 15) {
    throw new Error(`Invalid index ${index}`);
  }
  let operand = forwardedVals ? 1 : 0;
  operand <<= 7;
  operand += index;
  return operand;
}
