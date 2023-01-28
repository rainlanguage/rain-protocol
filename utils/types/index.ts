export * from "./redeemableERC20";
export * from "./sale";
export * from "./tier";
export * from "./stateConfig";

// @see https://stackoverflow.com/a/52490977
type _TupleOf<T, N extends number, R extends unknown[]> = R["length"] extends N
  ? R
  : _TupleOf<T, N, [T, ...R]>;
export type Tuple<T, N extends number> = N extends N
  ? number extends N
    ? T[]
    : _TupleOf<T, N, []>
  : never;

type getKeyValueType<T> = {
  [prop in keyof T]: T[prop];
};

/**
 * Sanitises `XStructOutput` imported from a `typechain` contract interface by removing the array part of the union.
 *
 * For example, given the following struct output:
 * ```
 * type TimeBoundStructOutput = [number, number] & {
 *  baseDuration: number;
 *  maxExtraTime: number;
 * };
 * ```
 *
 * Wrapping this with `Struct<T>` results in:
 * ```
 * type Struct<TimeBoundStructOutput> = {
 *  baseDuration: number;
 *  maxExtraTime: number;
 * };
 * ```
 */
export type Struct<T> = Omit<
  getKeyValueType<T>,
  keyof [] | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" // add more as needed
>;
