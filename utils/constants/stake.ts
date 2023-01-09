import { ethers } from "hardhat";
import { eighteenZeros, sixZeros } from "./bigNumber";
import { sixZeros } from ".";
import { BigNumber } from "ethers";
import { Stake } from "../../typechain";

export const THRESHOLDS = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000].map(
  (value) => ethers.BigNumber.from(value + sixZeros)
);

export const THRESHOLDS_18 = [
  1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000,
].map((value) => ethers.BigNumber.from(value + eighteenZeros));

interface Deposit {
  timestamp: number;
  amount: BigNumber;
}

export const getDeposits = async (stake: Stake, signerAddress: string) => {
  const deposits: Deposit[] = [];
  let i = 0;
  let flag = true;

  while (flag) {
    try {
      const depositItem = await stake.deposits(signerAddress, i);
      deposits.push(depositItem);
      i++;
    } catch (e) {
      flag = false;
    }
  }

  return deposits;
};
