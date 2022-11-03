import { ethers } from "hardhat";
import { LibBytesTest } from "../../../../typechain/contracts/test/bytes/LibBytes/LibBytesTest";

export const libBytesDeploy = async () => {
  const libBytesFactory = await ethers.getContractFactory("LibBytesTest");
  const libBytesTest = (await libBytesFactory.deploy()) as LibBytesTest;
  await libBytesTest.deployed();
  return libBytesTest;
};
