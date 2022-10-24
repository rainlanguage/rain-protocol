import { ethers } from "hardhat";
import { FlowFactory } from "../../../../../typechain/contracts/flow/basic/FlowFactory";

export const flowFactoryDeploy = async () => {
  const flowFactoryFactory = await ethers.getContractFactory("FlowFactory", {});
  const flowFactory = (await flowFactoryFactory.deploy()) as FlowFactory;
  await flowFactory.deployed();
  return flowFactory;
};
