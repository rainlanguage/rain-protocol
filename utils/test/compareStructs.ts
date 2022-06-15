import { BigNumber } from "ethers";
import { hexlify } from "ethers/lib/utils";
import { assert } from "chai";

/**
 * Uses chai `assert` to compare a Solidity struct with a JavaScript object by checking whether the values for each property are equivalent.
 * Will safely recurse over nested structs and compare nested properties.
 * Throws an error if any comparisons fail.
 * @param solStruct - Solidity struct, returned from something such as an emitted solidity Event. This should have an array-like structure with raw values followed by key-values (e.g. `solStruct: ['foo', 'bar', prop1: 'foo', prop2: 'bar']`).
 * @param jsObj - JavaScript object literal to use as comparison.
 */
export const compareStructs = (
  solStruct: unknown[],
  jsObj: Record<string, unknown>
) => {
  const solEntries = Object.entries(solStruct).splice(
    solStruct.length // actually half the solStruct size
  );

  if (!solEntries.length) {
    throw new Error(
      `Could not generate entries from a solStruct of length ${solStruct.length}. Ensure you are using a Solidity struct for solStruct.`
    );
  }

  const solObj = Object.fromEntries(solEntries);

  testStructs(solObj, jsObj);
};

/**
 * Uses chai `assert` to compare Solidity structs by checking whether the values for each property are equivalent.
 * Will safely recurse over nested structs and compare nested properties.
 * Throws an error if any comparisons fail.
 * @param solStructActual - Solidity struct, returned from something such as an emitted solidity Event. This should have an array-like structure with raw values followed by key-values (e.g. `solStruct: ['foo', 'bar', prop1: 'foo', prop2: 'bar']`).
 * @param solStructExpected - Solidity struct.
 */
export const compareSolStructs = (
  solStructActual: unknown[],
  solStructExpected: unknown[]
) => {
  const solActualEntries = Object.entries(solStructActual).splice(
    solStructActual.length // actually half the solStruct size
  );
  const solExpectedEntries = Object.entries(solStructExpected).splice(
    solStructExpected.length // actually half the solStruct size
  );

  if (!solActualEntries.length) {
    throw new Error(
      `Could not generate entries from a solStructActual of length ${solStructActual.length}. Ensure you are using a Solidity struct for solStructActual.`
    );
  }
  if (!solExpectedEntries.length) {
    throw new Error(
      `Could not generate entries from a solStructExpected of length ${solStructExpected.length}. Ensure you are using a Solidity struct for solStructExpected.`
    );
  }

  const solAObj = Object.fromEntries(solActualEntries);
  const solBObj = Object.fromEntries(solExpectedEntries);

  testSolStructs(solAObj, solBObj);
};

const testStructs = (
  solObj: Record<string, unknown>,
  jsObj: Record<string, unknown>
) => {
  Object.keys(solObj).forEach((key) => {
    let expectedValue = jsObj[key];
    let actualValue = solObj[key];

    if (expectedValue !== undefined) {
      if (expectedValue instanceof Uint8Array) {
        expectedValue = hexlify(expectedValue);
      }
      if (actualValue instanceof BigNumber) {
        expectedValue = BigNumber.from(expectedValue);
      }

      if (
        typeof actualValue === "string" ||
        typeof expectedValue === "string"
      ) {
        actualValue = `${actualValue}`.toLowerCase();
        expectedValue = `${expectedValue}`.toLowerCase();
      }

      if (
        typeof actualValue === "object" ||
        typeof expectedValue === "object"
      ) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        // recursive call for nested structs
        testStructs(actualValue, expectedValue);
      } else {
        let condition: boolean;
        try {
          condition =
            actualValue == expectedValue || actualValue["eq"](expectedValue);
        } catch (error) {
          console.log(error);
        }

        assert(
          condition,
          `wrong value for property: '${key}'
          expected  ${expectedValue}
          got       ${actualValue}`
        );
      }
    }
  });
};

const testSolStructs = (
  solActualObj: Record<string, unknown>,
  solExpectedObj: Record<string, unknown>
) => {
  Object.keys(solActualObj).forEach((key) => {
    const actualValue = solActualObj[key];
    const expectedValue = solExpectedObj[key];

    if (typeof actualValue === "object" || typeof expectedValue === "object") {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      // recursive call for nested structs
      testSolStructs(actualValue, expectedValue);
    } else {
      let condition: boolean;
      try {
        condition =
          actualValue == expectedValue || actualValue["eq"](expectedValue);
      } catch (error) {
        console.log(error);
      }

      assert(
        condition,
        `wrong value for property: '${key}'
        expected  ${expectedValue}
        got       ${actualValue}`
      );
    }
  });
};
