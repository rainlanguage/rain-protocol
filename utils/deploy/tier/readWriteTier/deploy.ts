import { ethers } from "hardhat";
import { ReadWriteTier } from "../../../../typechain";

export const readWriteTierDeploy = async () => {
  const readWriteTierFactory = await ethers.getContractFactory("ReadWriteTier");
  const readWriteTier = (await readWriteTierFactory.deploy()) as ReadWriteTier;
  await readWriteTier.deployed();
  return readWriteTier;
};
