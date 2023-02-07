/**
 * @public
 * Pretty prints a 2D matrix (array of arrays) to the console.
 *
 * @see https://gist.github.com/lbn/3d6963731261f76330af
 * @param mat - 2D matrix as an array of arrays
 */
export function prettyPrintMatrix(mat: number[][]): void {
  const shape = [mat.length, mat[0].length];
  function col(mat: number[][], i: number) {
    return mat.map((row) => row[i]);
  }
  const colMaxes = [];
  for (let i = 0; i < shape[1]; i++) {
    colMaxes.push(
      Math.max.apply(
        null,
        col(mat, i).map((n) => n.toString().length)
      )
    );
  }

  mat.forEach((row) => {
    console.log.apply(null, [
      ...row.map((val, j) => {
        return (
          new Array(colMaxes[j] - val.toString().length + 1).join("") +
          val.toString() +
          " " // space delimiter for values
        );
      }),
      ",", // comma delimiter for rows
    ]);
  });
}
