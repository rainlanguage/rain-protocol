import { ethers } from "hardhat";
import { eighteenZeros, sixZeros } from "./bigNumber";

export const THRESHOLDS = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000].map(
  (value) => ethers.BigNumber.from(value + sixZeros)
);

export const THRESHOLDS_18 = [
  1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000,
].map((value) => ethers.BigNumber.from(value + eighteenZeros));
