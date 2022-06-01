import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { assert } from "chai";
import { max_uint256 } from "../constants";
import { roughTimestampEquals } from "../time";

export const ALWAYS = 0;
export const NEVER = max_uint256;

export function numArrayToReport(numArray: number[]): BigNumber {
  assert(numArray.length === 8);

  return ethers.BigNumber.from(
    "0x" +
      [...numArray]
        .reverse()
        .map((i) => BigInt(i).toString(16).padStart(8, "0"))
        .join("")
  );
}

/**
 * Utility function that transforms a hexadecimal number from the output of the ITier contract report to an array of numbers
 * @param report hexadecimal string representation of the report
 * @returns array of slot numbers corresponding to each tier
 */
export function tierReport(report: string): number[] {
  const parsedReport: number[] = [];
  const arrStatus = [0, 1, 2, 3, 4, 5, 6, 7]
    .map((i) =>
      BigInt(report)
        .toString(16)
        .padStart(64, "0")
        .slice(i * 8, i * 8 + 8)
    )
    .reverse();

  for (const i in arrStatus) {
    parsedReport.push(parseInt("0x" + arrStatus[i]));
  }

  return parsedReport;
}

export function tierRange(startTier: number, endTier: number): number {
  //   op_.val & 0x0f, //     00001111
  //   op_.val & 0xf0, //     11110000

  if (startTier < 0 || startTier > 8) {
    throw new Error(`Invalid startTier ${startTier}`);
  } else if (endTier < 0 || endTier > 8) {
    throw new Error(`Invalid endTier ${endTier}`);
  }
  let range = endTier;
  range <<= 4;
  range += startTier;
  return range;
}

/**
 *
 * @param expectedReport - hexadecimal string containing the array data
 * @param actualReport - hexadecimal string containing the array data
 * @param precision - maximum number of seconds between timestamps
 */
export function compareTierReports(
  expectedReport: string,
  actualReport: string,
  precision: number
): void {
  tierReport(expectedReport).forEach((expectedTimestamp, index) => {
    const actualTimestamp = tierReport(actualReport)[index];

    assert(
      roughTimestampEquals(expectedTimestamp, actualTimestamp, precision),
      `wrong timestamp in report slot ${index}
      expected  ${expectedTimestamp}
      got       ${actualTimestamp}`
    );
  });
}
