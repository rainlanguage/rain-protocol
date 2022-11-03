import { ethers } from "hardhat";
import { FlowERC20Factory } from "../../../../../typechain/contracts/flow/erc20/FlowERC20Factory";

export const flowERC20FactoryDeploy = async () => {
  const flowFactoryFactory = await ethers.getContractFactory(
    "FlowERC20Factory",
    {}
  );
  const flowFactory = (await flowFactoryFactory.deploy()) as FlowERC20Factory;
  await flowFactory.deployed();
  return flowFactory;
};
