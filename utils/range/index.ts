function* iterate(a: number, b: number) {
  for (let i = a; i <= b; i += 1) {
    yield i;
  }
}

/**
 * @public
 * Creates array of integers from a to b, inclusive
 *
 * @param a - lowest number in range
 * @param b - highest number in range
 * @returns array of integers from a to b
 */
export const range = (a: number, b: number): number[] => [...iterate(a, b)];
