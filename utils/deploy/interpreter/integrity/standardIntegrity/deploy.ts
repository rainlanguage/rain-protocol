import { ethers } from "hardhat";
import { StandardIntegrity } from "../../../../../typechain";

export const standardIntegrityDeploy = async () => {
  const integrityFactory = await ethers.getContractFactory("StandardIntegrity");
  const integrity = (await integrityFactory.deploy()) as StandardIntegrity;
  await integrity.deployed();
  return integrity;
};
