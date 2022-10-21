import { ethers } from "hardhat";
import { LibUint256ArrayTest } from "../../../../typechain/contracts/test/array/LibUint256Array/LibUint256ArrayTest";

export const libUint256ArrayDeploy = async () => {
  const libUint256ArrayFactory = await ethers.getContractFactory(
    "LibUint256ArrayTest"
  );
  const libUint256ArrayTest =
    (await libUint256ArrayFactory.deploy()) as LibUint256ArrayTest;
  await libUint256ArrayTest.deployed();
  return libUint256ArrayTest;
};
