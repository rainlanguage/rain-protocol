import { ethers } from "hardhat";

export function pad(num: number, size: number) {
  let s = num + "";
  while (s.length < size) s = "0" + s;
  return s;
}

export function log(num: number, base: number) {
  return Math.log(num) / Math.log(base);
}

export function roundLog(num: number, base: number) {
  return Math.ceil(log(num, base));
}