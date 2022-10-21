import { ethers } from "hardhat";
import { LibMemorySizeTest } from "../../../../typechain/contracts/test/memory/LibMemorySize/LibMemorySizeTest";

export const libMemorySizeDeploy = async () => {
  const libMemorySizeFactory = await ethers.getContractFactory(
    "LibMemorySizeTest"
  );
  const libMemorySizeTest =
    (await libMemorySizeFactory.deploy()) as LibMemorySizeTest;
  await libMemorySizeTest.deployed();
  return libMemorySizeTest;
};
