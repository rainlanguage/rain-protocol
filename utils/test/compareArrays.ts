import { assert } from "chai";
import { BigNumber } from "ethers";

/**
 * Uses chai `assert` to compare a BigNumber array with JavaScript Array by matching them per index.
 * Throws an error if any comparisons fail.
 * @param solArr A BigNumber array returned from the interpreter i.e stack.
 * @param expectedArr Array to compare with
 */
export const compareArrays = (solArr: BigNumber[], expectedArr: number[]) => {
  // validating array length
  assert(
    solArr.length == expectedArr.length,
    `Array length mismatched for comparison. Ensure that both the arrays have the same length`
  );

  // validating values
  for (let i = 0; i < solArr.length; i++) {
    assert(
      solArr[i].eq(BigNumber.from(expectedArr[i])),
      `Array value mismatch at index: ${i}, expected ${expectedArr[i]} actual ${solArr[i]}`
    );
  }
};
