import { BigNumberish, BytesLike } from "ethers";
import {
  concat,
  Hexable,
  hexlify,
  zeroPad,
  solidityKeccak256,
} from "ethers/lib/utils";
import { PromiseOrValue } from "../../typechain/common";
import { EvaluableConfigStruct } from "../../typechain/contracts/flow/basic/Flow";
import {
  rainterpreterDeploy,
  rainterpreterStoreDeploy,
} from "../deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployerDeploy } from "../deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import { ExpressionConfig, rlc, MetaStore } from "@rainprotocol/rainlang";
import { getRainMetaDocumentFromOpmeta } from "../meta";

export enum MemoryType {
  Stack,
  Constant,
}

export enum SelectLteLogic {
  every,
  any,
}

export enum SelectLteMode {
  min,
  max,
  first,
}

/**
 * @public
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
 * @public
 * Converts an opcode and operand to bytes, and returns their concatenation.
 *
 * @param code - the opcode
 * @param erand - the operand, currently limited to 2 bytes (defaults to 0)
 * @returns a complete op that can be used in an interpreter expression
 */
export function op(
  code: number,
  erand: number | BytesLike | Hexable = 0
): Uint8Array {
  return concat([bytify(code, 2), bytify(erand, 2)]);
}

/**
 * @public
 * Builds the operand for RainInterpreter's `READ_MEMORY` opcode by packing 2 numbers into a single byte.
 *
 * @param type the kind of memory to read, the Stack or Constants array
 * @param offset index to read
 * @returns operand
 */
export function memoryOperand(type: MemoryType, offset: number): number {
  return (offset << 1) + type;
}
/**
 * @public
 * Builds the operand for RainInterpreter's `CALL` opcode by packing 3 numbers into a single byte.
 *
 * @param inputSize - number of inputs being passed to the source
 * @param outputSize - number of outputs returned by the source
 * @param sourceIndex - index of function source
 * @returns operand
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
 * @public
 * Builds the operand for RainInterpreter's `EXTERN` opcode by packing 3 numbers into a single byte.
 *
 * @param offset
 * @param inputs
 * @param outputs
 * @returns
 * @returns operand
 */
export function externOperand(
  inputs: number,
  outputs: number,
  offset: number
): number {
  const operand = (offset << 10) + (outputs << 5) + inputs;
  return operand;
}

/**
 * @public
 * Builds the operand for RainInterpreter's `LOOP_N` opcode by packing 4 numbers into a single byte.
 *
 * @param n - loop the source for n times
 * @param inputSize - number of inputs being passed to the source
 * @param outputSize - number of outputs returned by the source
 * @param sourceIndex - index of function source
 * @returns operand
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
 * @public
 * Builds the operand for RainInterpreter's `DO_WHILE` opcode by packing 3 numbers into two bytes.
 *
 * @param inputSize - number of inputs being passed to the source
 * @param reserved - reserved bytes
 * @param sourceIndex - index of function source
 * @returns operand
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
 * @public
 * Builds the operand for RainInterpreter's `SCALE18` opcode by packing 2 numbers into a single byte
 *
 * @param decimals - deciamls by which the value is to be scaled
 * @param rounding - rounding direction
 * @returns operand
 */
export function scale18Operand(decimals: number, rounding: number): number {
  const operand = (decimals << 1) + rounding;
  return operand;
}

/**
 * @public
 * Builds the operand for RainInterpreter's `zipmap` opcode by packing 3 numbers into a single byte. All parameters use zero-based counting i.e. an `fnSize` of 0 means to allocate one element (32 bytes) on the stack to define your functions, while an `fnSize` of 3 means to allocate all four elements (4 * 32 bytes) on the stack.
 *
 * @param sourceIndex - index of function source in `immutableSourceConfig.sources`
 * @param loopSize - number of times to subdivide vals, reduces uint256 size but allows for more vals (range 0-7)
 * @param valSize - number of vals in outer stack (range 0-7)
 * @returns operand
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

/**
 * @public
 * Builds the operand for `TierwiseCombine.selectLte`, which specifies how to compare tier reports.
 *
 * @param logic can be "every" or "any", which means that the reports for a given tier must either all or any be less than or equal to the reference `blockNumber_`
 * @param mode can be "min", "max", "first" which selects between all the block numbers for a given tier that meet the lte criteria.
 * @param inputSize how many values to take from the stack as reports to compare against each other and the block number
 * @returns operand
 */
export function selectLte(
  logic: SelectLteLogic,
  mode: SelectLteMode,
  inputSize: number
): number {
  const operand = (logic << 13) + (mode << 8) + inputSize;
  return operand;
}

/**
 * @public
 * Builds the operand for RainInterpreter's `FOLD_CONTEXT` opcode by packing 4 numbers into 2 bytes.
 *
 * @param sourceIndex - index of function source
 * @param column - column to start from
 * @param width - width of the column
 * @param inputs - accumulator input count
 * @returns operand
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

/**
 * @public
 * Builds an EvaluableConfig struct with expressionConfig and a store.
 *
 * @param expressionConfig - index of function source
 * @param isStore - used to toggle NO_STORE
 * @returns operand
 */
export async function generateEvaluableConfig(
  sources: PromiseOrValue<BytesLike>[],
  constants: PromiseOrValue<BigNumberish>[]
): Promise<EvaluableConfigStruct> {
  const interpreter = await rainterpreterDeploy();
  const store = await rainterpreterStoreDeploy();
  const expressionDeployer = await rainterpreterExpressionDeployerDeploy(
    interpreter,
    store
  );

  return {
    deployer: expressionDeployer.address,
    sources,
    constants,
  };
}

/**
 * @public
 * Builds sources and constants from a rainlang expression.
 *
 * @param expressionString - rainlang expression
 * @returns sources and constants
 */
export const standardEvaluableConfig = async (
  expression: string
): Promise<ExpressionConfig> => {
  const store = new MetaStore();
  await store.updateStore(opMetaHash);

  return await rlc(expression, store)
    .then((expressionConfig) => {
      return expressionConfig;
    })
    .catch((error) => {
      throw new Error(JSON.stringify(error, null, 2));
    });
};

/**
 * Given a source in opcodes compile to an equivalent source with real function pointers for a given Interpreter contract.
 * @param source Uncompiled Source
 * @param pointers Opcode function pointers
 * @returns Compiled Source
 */
export const compileSource = (source, pointers): string => {
  const pointersBottom = pointers.slice(2); // skip first 2 bytes
  const cursor = source.slice(2); // skip first 2 bytes
  const pointersArray = [];
  for (let i = 0; i < pointersBottom.length; i += 4) {
    const substr = pointersBottom.slice(i, i + 4);
    pointersArray.push(substr);
  }
  let result = "";
  for (let i = 0; i < cursor.length; i += 8) {
    const chunk = cursor.substring(i, i + 8);
    result += pointersArray[parseInt(chunk.slice(0, 4), 16)] + chunk.slice(4);
  }
  return "0x" + result;
};

let opMetaHashResult: string;

/**
 * @returns A hex string which is the keccak256 hash of opmeta
 */
export const getOpMetaHash = (): string => {
  if (!opMetaHashResult) {
    opMetaHashResult = solidityKeccak256(
      ["bytes"],
      [getRainMetaDocumentFromOpmeta()]
    );
  }
  return opMetaHashResult;
};

/**
 * @returns Keccak256 OpMetaHash
 */
export const opMetaHash = getOpMetaHash();
