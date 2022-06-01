/**
 *
 * @param t0 - first timestamp (in seconds) to compare
 * @param t1 - second timestamp (in seconds) to compare
 * @param precision - maximum number of seconds between timestamps
 * @returns True if `t0` and `t1` are within `precision` seconds of each other, and False otherwise
 */
export const roughTimestampEquals = (
  t0: number,
  t1: number,
  precision: number
): boolean => Math.abs(t0 - t1) <= precision;
