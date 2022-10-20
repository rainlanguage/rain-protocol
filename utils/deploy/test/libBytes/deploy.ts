import { ethers } from "hardhat";
import { LibBytesTest } from "../../../../typechain/contracts/test/bytes/LibBytes/LibBytesTest";

export const libBytesDeploy = async () => {
  const libBytesFactory = await ethers.getContractFactory("LibBytesTest");
  return (await libBytesFactory.deploy()) as LibBytesTest;
};
