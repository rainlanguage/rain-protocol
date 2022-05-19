import { max_uint256, max_uint32, ONE, RESERVE_MIN_BALANCE } from "./constants";
import { ethers } from "hardhat";
import { concat, Hexable, hexlify, Result, zeroPad } from "ethers/lib/utils";
import { BigNumber } from "ethers";
import chai from "chai";

import type { Contract, BytesLike, ContractTransaction } from "ethers";

const { assert } = chai;

export const basicDeploy = async (name, libs) => {
  const factory = await ethers.getContractFactory(name, {
    libraries: libs,
  });

  const contract = await factory.deploy();

  await contract.deployed();

  return contract;
};

export const fixedPointMul = (a: BigNumber, b: BigNumber): BigNumber =>
  a.mul(b).div(ONE);
export const fixedPointDiv = (a: BigNumber, b: BigNumber): BigNumber =>
  a.mul(ONE).div(b);
export const minBN = (a: BigNumber, b: BigNumber): BigNumber =>
  a.lt(b) ? a : b;
export const maxBN = (a: BigNumber, b: BigNumber): BigNumber =>
  a.gt(b) ? a : b;

export const determineReserveDust = (bPoolReserveBalance: BigNumber) => {
  let dust = bPoolReserveBalance.mul(ONE).div(1e7).div(ONE);
  if (dust.lt(RESERVE_MIN_BALANCE)) {
    dust = RESERVE_MIN_BALANCE;
  }
  return dust;
};

export const assertError = async (f, s: string, e: string) => {
  let didError = false;
  try {
    await f();
  } catch (e) {
    assert(e.toString().includes(s), `error string ${e} does not include ${s}`);
    didError = true;
  }
  assert(didError, e);
};

export const createEmptyBlock = async (count?: number): Promise<void> => {
  const signers = await ethers.getSigners();
  const tx = { to: signers[1].address };
  if (count > 0) {
    for (let i = 0; i < count; i++) {
      await signers[0].sendTransaction(tx);
    }
  } else {
    await signers[0].sendTransaction(tx);
  }
};

export function blockNumbersToReport(blockNos: number[]): BigNumber {
  assert(blockNos.length === 8);

  return ethers.BigNumber.from(
    "0x" +
      [...blockNos]
        .reverse()
        .map((i) => BigInt(i).toString(16).padStart(8, "0"))
        .join("")
  );
}

/**
 * Pads leading zeroes of hex number to hex string length of 32 bytes
 * @param {BigNumber} hex
 */
export function zeroPad32(hex: BigNumber): string {
  return ethers.utils.hexZeroPad(hex.toHexString(), 32);
}

/**
 * Pads leading zeroes of hex number to hex string length of 4 bytes
 * @param {BigNumber} hex
 */
export function zeroPad4(hex: BigNumber): string {
  return ethers.utils.hexZeroPad(hex.toHexString(), 4);
}

/**
 * Converts a value to raw bytes representation. Assumes `value` is less than or equal to 1 byte, unless a desired `bytesLength` is specified.
 *
 * @param value - value to convert to raw bytes format
 * @param bytesLength - (defaults to 1) number of bytes to left pad if `value` doesn't completely fill the desired amount of memory. Will throw `InvalidArgument` error if value already exceeds bytes length.
 * @returns {Uint8Array} - raw bytes representation
 */
export function bytify(
  value: number | BytesLike | Hexable,
  bytesLength = 1
): BytesLike {
  return zeroPad(hexlify(value), bytesLength);
}

/**
 * Converts an opcode and operand to bytes, and returns their concatenation.
 * @param code - the opcode
 * @param erand - the operand, currently limited to 1 byte (defaults to 0)
 */
export function op(
  code: number,
  erand: number | BytesLike | Hexable = 0
): Uint8Array {
  return concat([bytify(code), bytify(erand)]);
}

export const paddedUInt256 = (report: BigNumber): string => {
  if (report.gt(max_uint256)) {
    throw new Error(`${report} exceeds max uint256`);
  }
  return "0x" + report.toHexString().substring(2).padStart(64, "0");
};

export const paddedUInt32 = (number: number | BytesLike | Hexable): string => {
  if (ethers.BigNumber.from(number).gt(max_uint32)) {
    throw new Error(`${number} exceeds max uint32`);
  }
  return hexlify(number).substring(2).padStart(8, "0");
};

/**
 *
 * @param tx - transaction where event occurs
 * @param eventName - name of event
 * @param contract - contract object holding the address, filters, interface
 * @param contractAddressOverride - (optional) override the contract address which emits this event
 * @returns Array of events with their arguments, which can each be deconstructed by array index or by object key
 */
export const getEvents = async (
  tx: ContractTransaction,
  eventName: string,
  contract: Contract,
  contractAddressOverride: string = null
): Promise<Result[]> => {
  const address = contractAddressOverride
    ? contractAddressOverride
    : contract.address;

  const eventObjs = (await tx.wait()).events.filter(
    (x) =>
      x.topics[0] == contract.filters[eventName]().topics[0] &&
      x.address == address
  );

  if (!eventObjs.length) {
    throw new Error(`Could not find event ${eventName} at address ${address}`);
  }

  return eventObjs.map((eventObj) =>
    contract.interface.decodeEventLog(eventName, eventObj.data)
  );
};

/**
 *
 * @param tx - transaction where event occurs
 * @param eventName - name of event
 * @param contract - contract object holding the address, filters, interface
 * @param contractAddressOverride - (optional) override the contract address which emits this event
 * @returns Event arguments of first matching event, can be deconstructed by array index or by object key
 */
export const getEventArgs = async (
  tx: ContractTransaction,
  eventName: string,
  contract: Contract,
  contractAddressOverride: string = null
): Promise<Result> => {
  return (await getEvents(tx, eventName, contract, contractAddressOverride))[0];
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
