export const flatten2D = <T>(matrix: T[][]): T[] => {
  const result = [];

  matrix.forEach((row) => {
    row.forEach((element) => {
      result.push(element);
    });
  });

  return result;
};
