import { BigNumber } from "ethers";
import { ONE } from "../constants";

/**
 * @public
 * Emulates `LibFixedPointMath.scaleRatio` function.
 *
 * @param ratio The ratio to be scaled.
 * @param aDecimals The decimals of the ratio numerator.
 * @param bDecimals The decimals of the ratio denominator.
 * @returns scaled ratio as BigNumber
 */
export const scaleRatio = (
  ratio: BigNumber,
  aDecimals: number,
  bDecimals: number
): BigNumber => {
  return scaleBy(ratio, bDecimals - aDecimals);
};

/**
 * @public
 * Emulates `LibFixedPointMath.scaleBy` function.
 *
 * @param a Some integer of any scale.
 * @param scaleBy OOMs to scale `a_` up or down by. This is a SIGNED int8 which means it can be negative, and also means that sign extension MUST be considered if changing it to another type.
 * @returns
 */
export const scaleBy = (a: BigNumber, scaleBy: number): BigNumber => {
  if (scaleBy == 0) {
    return a;
  } else if (scaleBy > 0) {
    return a.mul(10 ** scaleBy);
  } else {
    return a.div(10 ** -scaleBy);
  }
};

/**
 * @public
 * Partially emulates `LibFixedPointMath.fixedPointMul` function, but to 18 fixed point decimals.
 *
 * @param a First term.
 * @param b Second term.
 * @returns `a_` multiplied by `b_` to 18 fixed point decimals.
 */
export const fixedPointMul = (a: BigNumber, b: BigNumber): BigNumber =>
  a.mul(b).div(ONE);

/**
 * @public
 * Partially emulates `LibFixedPointMath.fixedPointDiv` function, but to 18 fixed point decimals.
 *
 * @param a First term.
 * @param b Second term.
 * @returns `a_` divided by `b_` to 18 fixed point decimals.
 */
export const fixedPointDiv = (a: BigNumber, b: BigNumber): BigNumber =>
  a.mul(ONE).div(b);

/**
 * @public
 * Returns the minimum of BigNumbers `a` and `b`.
 *
 * @param a First term.
 * @param b Second term.
 * @returns BigNumber
 */
export const minBN = (a: BigNumber, b: BigNumber): BigNumber =>
  a.lt(b) ? a : b;

/**
 * @public
 * Returns the maximum of BigNumbers `a` and `b`.
 *
 * @param a First term.
 * @param b Second term.
 * @returns BigNumber
 */
export const maxBN = (a: BigNumber, b: BigNumber): BigNumber =>
  a.gt(b) ? a : b;

/**
 * @public
 * Compute the excess kurtosis of an array of values
 *
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
