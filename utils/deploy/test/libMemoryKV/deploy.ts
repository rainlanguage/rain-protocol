import { ethers } from "hardhat";
import { LibMemoryKVTest } from "../../../../typechain/contracts/test/kv/LibMemoryKVTest";

export const libMemoryKVDeploy = async () => {
  const libMemoryKVFactory = await ethers.getContractFactory("LibMemoryKVTest");
  const libMemoryKVTest =
    (await libMemoryKVFactory.deploy()) as LibMemoryKVTest;
  await libMemoryKVTest.deployed();
  return libMemoryKVTest;
};
