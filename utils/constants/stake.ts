import { ethers } from "hardhat";
import { sixZeros } from ".";

export const THRESHOLDS = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000].map(
  (value) => ethers.BigNumber.from(value + sixZeros)
);
