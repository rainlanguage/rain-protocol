import { BigNumber, BytesLike } from "ethers";
import { Hexable, hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { max_uint256, max_uint32 } from "../constants";

export function numberify(bytes: BytesLike) {
  return ethers.BigNumber.from(bytes).toNumber();
}

export function bitify(number: number) {
  return (number >>> 0).toString(2);
}

/**
 * @public
 * Creates a random 20 byte address.
 *
 * @returns A DataHexString of typical address length
 */
export function randomAddress() {
  return hexlify(ethers.BigNumber.from(ethers.utils.randomBytes(20)));
}

/**
 * @see https://docs.ethers.io/v5/api/utils/bytes/#utils-hexDataSlice
 * @returns DataHexString array representation of a slice of aBytesLike
 */
export function readUint256BytesArrayFromMemDump(
  bytes: BytesLike,
  pointer: number,
  length: number
): string[] {
  const array = [];
  for (let i_ = 0; i_ < length; i_++) {
    const position = pointer + i_ * 32;
    array.push(ethers.utils.hexDataSlice(bytes, position, position + 32));
  }
  return array;
}

/**
 * @see https://docs.ethers.io/v5/api/utils/bytes/#utils-hexDataSlice
 * @returns a DataHexString representation of a slice of aBytesLike, from offset (in bytes) to endOffset (in bytes). If endOffset is omitted, the length of aBytesLike is used.
 */
export function readBytes(bytes: BytesLike, from: number, to?: number): string {
  return ethers.utils.hexDataSlice(bytes, from, to);
}

/**
 * @returns a random 32 byte number in hexstring format
 */
export function randomUint256(): string {
  return ethers.utils.hexZeroPad(ethers.utils.randomBytes(32), 32);
}

/**
 * @public
 * Pads leading zeroes of BigNumber to hex string length of 32 bytes
 *
 * @param {BigNumber} num - input value as BigNumber or JS number
 * @returns 32 byte hex string
 */
export function zeroPad32(num: BigNumber | number): string {
  if (typeof num === "number") {
    num = ethers.BigNumber.from(num);
  }
  if (num.gt(max_uint256)) {
    throw new Error(`${num} exceeds max uint256`);
  }
  return ethers.utils.hexZeroPad(num.toHexString(), 32);
}

/**
 * @public
 * Pads leading zeroes of BigNumber to hex string length of 4 bytes
 *
 * @param {BigNumber} num - input value as BigNumber or JS number
 * @returns 4 byte hex string
 */
export function zeroPad4(num: BigNumber | number): string {
  if (typeof num === "number") {
    num = ethers.BigNumber.from(num);
  }
  if (num.gt(max_uint32)) {
    throw new Error(`${num} exceeds max uint32`);
  }
  return ethers.utils.hexZeroPad(num.toHexString(), 4);
}

/**
 * @public
 * Pads leading zeroes of BigNumber to hex string length of 2 bytes
 *
 * @param {BigNumber} num - input value as BigNumber or JS number
 * @returns 2 byte hex string
 */
export function zeroPad2(num: BigNumber | number): string {
  if (typeof num === "number") {
    num = ethers.BigNumber.from(num);
  }
  return ethers.utils.hexZeroPad(num.toHexString(), 2);
}

/**
 * @public
 * Pads leading zeroes of BigNumber to hex string length of 4 bytes, without the `0x` prefix (allowing for easier concatenation of numbers, such as for constructing a tier report)
 *
 * @param {BigNumber} num - input value as BigNumber or JS number
 * @returns 4 byte hex string without `0x` prefix
 */
export const paddedUInt32 = (
  number: number | BytesLike | Hexable | BigNumber
): string => {
  const value = ethers.BigNumber.isBigNumber(number)
    ? number
    : ethers.BigNumber.from(number);
  if (value.gt(max_uint32)) {
    throw new Error(`${number} exceeds max uint32`);
  }
  return hexlify(number).substring(2).padStart(8, "0");
};

/**
 * @public
 * Emulates 2-bit unsigned integer overflow
 *
 * @param integer input value, which may exceed 2-bit unsigned integer
 * @returns 'overflowed' number
 */
export const wrap2BitUInt = (integer: number) => {
  return integer % 4;
};

/**
 * @public
 * Emulates 4-bit unsigned integer overflow
 *
 * @param integer input value, which may exceed 4-bit unsigned integer
 * @returns 'overflowed' number
 */
export const wrap4BitUInt = (integer: number) => {
  return integer % 16;
};

/**
 * @public
 * Emulates 8-bit unsigned integer overflow
 *
 * @param integer input value, which may exceed 8-bit unsigned integer
 * @returns 'overflowed' number
 */
export const wrap8BitUInt = (integer: number) => {
  return integer % 256;
};

/**
 * @public
 * Constructs array of consecutive 2-bit unsigned integers, wrapping if an overflow occurs
 *
 * @returns array of 2-bit unsigned integers
 */
export const array2BitUInts = (length: number): number[] =>
  Array(length)
    .fill(0)
    .map((_, i) => wrap2BitUInt(i));

/**
 * @public
 * Constructs array of consecutive 4-bit unsigned integers, wrapping if an overflow occurs
 *
 * @returns array of 4-bit unsigned integers
 */
export const array4BitUInts = (length: number): number[] =>
  Array(length)
    .fill(0)
    .map((_, i) => wrap4BitUInt(i));

/**
 * @public
 * Constructs array of consecutive 8-bit unsigned integers, wrapping if an overflow occurs
 *
 * @returns array of 8-bit unsigned integers
 */
export const array8BitUInts = (length: number): number[] =>
  Array(length)
    .fill(0)
    .map((_, i) => wrap8BitUInt(i));
