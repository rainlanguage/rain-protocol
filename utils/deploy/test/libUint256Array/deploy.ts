import { ethers } from "hardhat";
import { LibUint256ArrayTest } from "../../../../typechain/contracts/test/array/LibUint256Array/LibUint256ArrayTest";

export const libUint256ArrayDeploy = async () => {
  const libUint256ArrayFactory = await ethers.getContractFactory(
    "LibUint256ArrayTest"
  );
  return (await libUint256ArrayFactory.deploy()) as LibUint256ArrayTest;
};
