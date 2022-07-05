import { BigNumber, BytesLike } from "ethers";
import { Hexable, hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { max_uint256, max_uint32 } from "../constants";

/**
 * Pads leading zeroes of hex number to hex string length of 32 bytes
 * @param {BigNumber} hex
 */
export function zeroPad32(hex: BigNumber): string {
  return ethers.utils.hexZeroPad(hex.toHexString(), 32);
}

/**
 * Pads leading zeroes of hex number to hex string length of 4 bytes
 * @param {BigNumber} hex
 */
export function zeroPad4(hex: BigNumber): string {
  return ethers.utils.hexZeroPad(hex.toHexString(), 4);
}

export const paddedUInt256 = (report: BigNumber): string => {
  if (report.gt(max_uint256)) {
    throw new Error(`${report} exceeds max uint256`);
  }
  return "0x" + report.toHexString().substring(2).padStart(64, "0");
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

export const array2BitUInts = (length) =>
  Array(length)
    .fill(0)
    // .map((_, i) => 3);
    .map((_, i) => wrap2BitUInt(i));

export const array4BitUInts = (length) =>
  Array(length)
    .fill(0)
    .map((_, i) => wrap4BitUInt(i));

export const array8BitUInts = (length) =>
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
