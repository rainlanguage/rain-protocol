import { BigNumber } from "ethers";
import { ONE } from "../constants";

export const scaleRatio = (
  ratio: BigNumber,
  aDecimals: number,
  bDecimals: number
) => {
  return scaleBy(ratio, bDecimals - aDecimals);
};

export const scaleBy = (a: BigNumber, scaleBy: number): BigNumber => {
  if (scaleBy == 0) {
    return a;
  } else if (scaleBy > 0) {
    return a.mul(10 ** scaleBy);
  } else {
    return a.div(10 ** -scaleBy);
  }
};

export const fixedPointMul = (a: BigNumber, b: BigNumber): BigNumber =>
  a.mul(b).div(ONE);
export const fixedPointDiv = (a: BigNumber, b: BigNumber): BigNumber =>
  a.mul(ONE).div(b);
export const minBN = (a: BigNumber, b: BigNumber): BigNumber =>
  a.lt(b) ? a : b;
export const maxBN = (a: BigNumber, b: BigNumber): BigNumber =>
  a.gt(b) ? a : b;

/**
 * Compute the excess kurtosis of an array of values
 * @param {Array<number>} arr - Array of values
 * @returns {Number} - sample excess kurtosis
 */
export const kurtosis = (arr: Array<number>): number => {
  const len = arr.length;
  let delta = 0;
  let delta_n = 0;
  let delta_n2 = 0;
  let term1 = 0;
  let N = 0;
  let mean = 0;
  let M2 = 0;
  let M3 = 0;
  let M4 = 0;

  for (let i = 0; i < len; i++) {
    N += 1;

    // Standard deviation
    delta = arr[i] - mean;
    delta_n = delta / N;
    delta_n2 = delta_n * delta_n;

    term1 = delta * delta_n * (N - 1);

    // moment
    M4 +=
      term1 * delta_n2 * (N * N - 3 * N + 3) +
      6 * delta_n2 * M2 -
      4 * delta_n * M3;
    M3 += term1 * delta_n * (N - 2) - 3 * delta_n * M2;
    M2 += term1;
    mean += delta_n;
  }

  // Calculate the population excess kurtosis:
  const g = (N * M4) / (M2 * M2) - 3;

  // Return the corrected sample excess kurtosis:
  return ((N - 1) / ((N - 2) * (N - 3))) * ((N + 1) * g + 6);
};
