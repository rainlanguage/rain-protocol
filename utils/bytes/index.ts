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
 * Creates a random 20 byte address.
 * @returns A DataHexString of typical address length
 */
export function randomAddress() {
  return hexlify(ethers.BigNumber.from(ethers.utils.randomBytes(20)));
}

/**
 * Returns a DataHexString array representation of a slice of aBytesLike.
 * @see https://docs.ethers.io/v5/api/utils/bytes/#utils-hexDataSlice
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
 * Returns a DataHexString representation of a slice of aBytesLike, from offset (in bytes) to endOffset (in bytes). If endOffset is omitted, the length of aBytesLike is used.
 * @see https://docs.ethers.io/v5/api/utils/bytes/#utils-hexDataSlice
 */
export function readBytes(bytes: BytesLike, from: number, to?: number): string {
  return ethers.utils.hexDataSlice(bytes, from, to != null ? to : null);
}

/**
 * Returns a random 32 byte number in hexstring format
 */
export function randomUint256(): string {
  return ethers.utils.hexZeroPad(ethers.utils.randomBytes(32), 32);
}

/**
 * Pads leading zeroes of BigNumber to hex string length of 32 bytes
 * @param {BigNumber} num
 */
export function zeroPad32(num: BigNumber | number): string {
  if (typeof num === "number") {
    num = ethers.BigNumber.from(num);
  }
  return ethers.utils.hexZeroPad(num.toHexString(), 32);
}

/**
 * Pads leading zeroes of BigNumber to hex string length of 4 bytes
 * @param {BigNumber} num
 */
export function zeroPad4(num: BigNumber | number): string {
  if (typeof num === "number") {
    num = ethers.BigNumber.from(num);
  }
  return ethers.utils.hexZeroPad(num.toHexString(), 4);
}

/**
 * Pads leading zeroes of BigNumber to hex string length of 2 bytes
 * @param {BigNumber} num
 */
export function zeroPad2(num: BigNumber | number): string {
  if (typeof num === "number") {
    num = ethers.BigNumber.from(num);
  }
  return ethers.utils.hexZeroPad(num.toHexString(), 2);
}

export const paddedUInt256 = (num: BigNumber | number): string => {
  if (typeof num === "number") {
    num = ethers.BigNumber.from(num);
  }
  if (num.gt(max_uint256)) {
    throw new Error(`${num} exceeds max uint256`);
  }
  return "0x" + num.toHexString().substring(2).padStart(64, "0");
};

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

export const wrap2BitUInt = (integer: number) => {
  while (integer > 3) {
    integer -= 4;
  }
  return integer;
};

export const wrap4BitUInt = (integer: number) => {
  while (integer > 15) {
    integer -= 16;
  }
  return integer;
};

export const wrap8BitUInt = (integer: number) => {
  while (integer > 255) {
    integer -= 256;
  }
  return integer;
};

export const array2BitUInts = (length: number): number[] =>
  Array(length)
    .fill(0)
    // .map((_, i) => 3);
    .map((_, i) => wrap2BitUInt(i));

export const array4BitUInts = (length: number): number[] =>
  Array(length)
    .fill(0)
    .map((_, i) => wrap4BitUInt(i));

export const array8BitUInts = (length: number): number[] =>
  Array(length)
    .fill(0)
    .map((_, i) => wrap8BitUInt(i));

export const pack32UIntsIntoByte = (numArray: number[]): number[] => {
  const val: number[] = [];
  let valIndex = 0;

  for (let i = 0; i < numArray.length; i += 4) {
    const byte =
      (numArray[i] << 6) +
      (numArray[i + 1] << 4) +
      (numArray[i + 2] << 2) +
      numArray[i + 3];

    val[valIndex] = byte;
    valIndex++;
  }

  return val;
};
