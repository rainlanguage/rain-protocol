import { assert } from "chai";
import { BigNumber } from "ethers";
import { hexlify } from "ethers/lib/utils";
import { StateConfig } from "../types";


/**
 * Uses chai `assert` to compare a Solidity struct with a JavaScript object by checking whether the values for each property are equivalent.
 * Will safely recurse over nested structs and compare nested properties.
 * Throws an error if any comparisons fail.
 * @param solStruct Solidity struct, returned from something such as an emitted solidity Event. This should have an array-like structure with raw values followed by key-values (e.g. `solStruct: ['foo', 'bar', prop1: 'foo', prop2: 'bar']`).
 * @param jsObj JavaScript object literal to use as comparison.
 * @param debug (default: false) Optional debug logging
 */
export const compareStructs = (
  solStruct: unknown[],
  jsObj: Record<string, unknown>,
  debug = false
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

  testStructs(solObj, jsObj, debug);
};

/**
 * Uses chai `assert` to compare Solidity structs by checking whether the values for each property are equivalent.
 * Will safely recurse over nested structs and compare nested properties.
 * Throws an error if any comparisons fail.
 * @param solStructActual Solidity struct, returned from something such as an emitted solidity Event. This should have an array-like structure with raw values followed by key-values (e.g. `solStruct: ['foo', 'bar', prop1: 'foo', prop2: 'bar']`).
 * @param solStructExpected Solidity struct.
 * @param debug (default: false) Optional debug logging
 */
export const compareSolStructs = (
  solStructActual: unknown[],
  solStructExpected: unknown[],
  debug = false
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

  testSolStructs(solAObj, solBObj, debug);
};

const testStructs = (
  solObj: Record<string, unknown>,
  jsObj: Record<string, unknown>,
  debug: boolean
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
        // recursive call for nested structs
        testStructs(
          actualValue as Record<string, unknown>,
          expectedValue as Record<string, unknown>,
          debug
        );
      } else {
        let condition: boolean;
        try {
          if (debug)
            console.log({ actualValue, expectedValue, key, jsObj, solObj });

          condition =
            actualValue == expectedValue || actualValue["eq"](expectedValue);
        } catch (error) {
          console.log(error);
        }

        assert(
          condition,
          `wrong value for property: '${key}'
          expected  ${expectedValue}
          got       ${actualValue}
          -
          key       ${key}
          object    ${solObj}`
        );
      }
    }
  });
};

const testSolStructs = (
  solActualObj: Record<string, unknown>,
  solExpectedObj: Record<string, unknown>,
  debug: boolean
) => {
  Object.keys(solActualObj).forEach((key) => {
    const actualValue = solActualObj[key];
    const expectedValue = solExpectedObj[key];

    if (typeof actualValue === "object" || typeof expectedValue === "object") {
      // recursive call for nested structs
      testSolStructs(
        actualValue as Record<string, unknown>,
        expectedValue as Record<string, unknown>,
        debug
      );
    } else {
      let condition: boolean;
      try {
        if (debug)
          console.log({
            actualValue,
            expectedValue,
            key,
            solActualObj,
            solExpectedObj,
          });

        condition =
          actualValue == expectedValue || actualValue["eq"](expectedValue);
      } catch (error) {
        console.log(error);
      }

      assert(
        condition,
        `wrong value for property: '${key}'
        expected  ${expectedValue}
        got       ${actualValue}
        -
        key       ${key}
        object    ${solActualObj}`
      );
    }
  });
};

/**
 * @public
 * Checks 2 StateConfig objects to see if they are equal or not
 *
 * @param config1 - first StateConfig
 * @param config2 - second StateConfig
 * @returns boolean
 */
 export const areEqualStateConfigs = (
  config1: StateConfig,
  config2: StateConfig
): boolean => {
  if (config1.constants.length !== config2.constants.length) return false;
  if (config1.sources.length !== config2.sources.length) return false;

  const aConstants: BigNumber[] = [];
  const bConstants: BigNumber[] = [];
  for (const item of config1.constants) {
      aConstants.push(BigNumber.from(item));
  }
  for (const item of config2.constants) {
      bConstants.push(BigNumber.from(item));
  }

  for (let i = 0; i < aConstants.length; i++) {
      if (!aConstants[i].eq(bConstants[i])) return false;
  }

  const aSources: string[] = [];
  const bSources: string[] = [];
  for (const item of config1.sources) {
      aSources.push(hexlify(item, { allowMissingPrefix: true }));
  }
  for (const item of config2.sources) {
      bSources.push(hexlify(item, { allowMissingPrefix: true }));
  }

  for (let i = 0; i < aSources.length; i++) {
      if (aSources[i] !== bSources[i]) return false;
  }

  return true;
}

