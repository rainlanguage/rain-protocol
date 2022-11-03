import { ethers } from "hardhat";
import { LibCastTest } from "../../../../typechain/contracts/test/type/LibCast/LibCastTest";

export const libCastDeploy = async () => {
  const libCastFactory = await ethers.getContractFactory("LibCastTest");
  const libCast = (await libCastFactory.deploy()) as LibCastTest;
  await libCast.deployed();
  return libCast;
};
