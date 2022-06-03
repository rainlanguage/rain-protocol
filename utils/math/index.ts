import { BigNumber } from "ethers";
import { ONE } from "../constants";

export const fixedPointMul = (a: BigNumber, b: BigNumber): BigNumber =>
  a.mul(b).div(ONE);
export const fixedPointDiv = (a: BigNumber, b: BigNumber): BigNumber =>
  a.mul(ONE).div(b);
export const minBN = (a: BigNumber, b: BigNumber): BigNumber =>
  a.lt(b) ? a : b;
export const maxBN = (a: BigNumber, b: BigNumber): BigNumber =>
  a.gt(b) ? a : b;
