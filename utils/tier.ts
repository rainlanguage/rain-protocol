import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import chai from "chai";
import { max_uint256 } from "./constants";

const { assert } = chai;

export const ALWAYS = 0;
export const NEVER = max_uint256;

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
 * Utility function that transforms a hexadecimal number from the output of the ITier contract report
 * @param report String with Hexadecimal containing the array data
 * @returns number[] Block array of the reports
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
  //arrStatus = arrStatus.reverse();

  for (const i in arrStatus) {
    parsedReport.push(parseInt("0x" + arrStatus[i]));
  }

  return parsedReport;
}
