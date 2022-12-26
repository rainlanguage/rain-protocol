import { BytesLike } from "ethers";
import { concat, Hexable, hexlify, zeroPad } from "ethers/lib/utils";
import { AllStandardOps } from "./ops/allStandardOps";

export enum MemoryType {
  Stack,
  Constant,
}

export enum Debug {
  StatePacked,
  Stack,
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

export function DEBUG_STATE_PACKED(items: ReadonlyArray<BytesLike>): BytesLike {
  return concat([...items, op(AllStandardOps.DEBUG, Debug.StatePacked)]);
}

export function DEBUG_STACK(items: ReadonlyArray<BytesLike>): BytesLike {
  return concat([...items, op(AllStandardOps.DEBUG, Debug.Stack)]);
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
 * @param erand - the operand, currently limited to 2 bytes (defaults to 0)
 */
export function op(
  code: number,
  erand: number | BytesLike | Hexable = 0
): Uint8Array {
  return concat([bytify(code, 2), bytify(erand, 2)]);
}

export function memoryOperand(type: number, offset: number): number {
  return (offset << 1) + type;
}
/**
 * Builds the operand for RainInterpreter's `CALL` opcode by packing 3 numbers into a single byte.
 *
 * @param inputSize - number of inputs being passed to the source
 * @param outputSize - number of outputs returned by the source
 * @param sourceIndex - index of function source
 */
export function callOperand(
  inputSize: number,
  outputSize: number,
  sourceIndex: number
): number {
  const operand = (sourceIndex << 8) + (outputSize << 4) + inputSize;
  return operand;
}

/**
 * Builds the operand for RainInterpreter's `LOOP_N` opcode by packing 4 numbers into a single byte.
 *
 * @param n - loop the source for n times
 * @param inputSize - number of inputs being passed to the source
 * @param outputSize - number of outputs returned by the source
 * @param sourceIndex - index of function source
 */
export function loopNOperand(
  n: number,
  inputSize: number,
  outputSize: number,
  sourceIndex: number
): number {
  const operand = (n << 12) + callOperand(inputSize, outputSize, sourceIndex);
  return operand;
}

/**
 * Builds the operand for RainInterpreter's `DO_WHILE` opcode by packing 3 numbers into a single byte.
 *
 * @param inputSize - number of inputs being passed to the source
 * @param reserved - reserved bytes
 * @param sourceIndex - index of function source
 */
export function doWhileOperand(
  inputSize: number,
  reserved: number,
  sourceIndex: number
): number {
  const operand = (sourceIndex << 8) + (reserved << 4) + inputSize;
  return operand;
}

/**
 * Builds the operand for RainInterpreter's `zipmap` opcode by packing 3 numbers into a single byte. All parameters use zero-based counting i.e. an `fnSize` of 0 means to allocate one element (32 bytes) on the stack to define your functions, while an `fnSize` of 3 means to allocate all four elements (4 * 32 bytes) on the stack.
 *
 * @param sourceIndex - index of function source in `immutableSourceConfig.sources`
 * @param loopSize - number of times to subdivide vals, reduces uint256 size but allows for more vals (range 0-7)
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
  let operand = valSize;
  operand <<= 2;
  operand += loopSize;
  operand <<= 3;
  operand += sourceIndex;
  return operand;
}

export function selectLte(
  logic: number,
  mode: number,
  inputSize: number
): number {
  const operand = (logic << 13) + (mode << 8) + inputSize;
  return operand;
}

/**
 * Builds the operand for RainInterpreter's `FOLD_CONTEXT` opcode by packing 4 numbers into 2 bytes.
 *
 * @param sourceIndex - index of function source
 * @param column - column to start from
 * @param width - width of the column
 * @param inputs - accumulator input count
 */
export function foldContextOperand(
  sourceIndex: number,
  column: number,
  width: number,
  inputs: number
): number {
  const operand = (inputs << 12) + (width << 8) + (column << 4) + sourceIndex;
  return operand;
}
