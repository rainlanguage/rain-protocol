function* iterate(a, b) {
  for (let i = a; i <= b; i += 1) {
    yield i;
  }
}

/**
 * Creates array of numbers from a to b, inclusive
 * @param a - lowest number in range
 * @param b - highest number in range
 * @returns
 */
export const range = (a, b): number[] => [...iterate(a, b)];
