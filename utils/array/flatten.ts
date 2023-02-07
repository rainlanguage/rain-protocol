/**
 * @public
 * Takes a 2D matrix object (an array of arrays) and flattens it into a single array by concatenating each array.
 *
 * @param matrix - array of arrays
 * @returns single flattened array
 */
export const flatten2D = <T>(matrix: T[][]): T[] => {
  const result = [];

  matrix.forEach((row) => {
    result.push(...row);
  });

  return result;
};
