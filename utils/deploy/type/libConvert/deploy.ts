import { ethers } from "hardhat";
import { LibConvertTest } from "../../../../typechain/contracts/test/type/LibConvert/LibConvertTest";

export const libConvertDeploy = async () => {
  const libConvertFactory = await ethers.getContractFactory("LibConvertTest");
  const libConvert = (await libConvertFactory.deploy()) as LibConvertTest;
  await libConvert.deployed();
  return libConvert;
};
