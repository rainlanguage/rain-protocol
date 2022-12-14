import { ethers } from "hardhat";

export const basicDeploy = async (name: string, libs = {}, args = []) => {
  const factory = await ethers.getContractFactory(name, {
    libraries: libs,
  });

  const contract = await factory.deploy(...args);

  await contract.deployed();

  return contract;
};
