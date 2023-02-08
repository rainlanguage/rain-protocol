import { ethers } from "hardhat";
import { FlowFactory } from "../../../../../typechain/contracts/flow/basic/FlowFactory";
import { getRainContractMetaBytes } from "../../../../meta";

export const flowFactoryDeploy = async () => {
  const flowFactoryFactory = await ethers.getContractFactory("FlowFactory", {});
  const flowFactory = (await flowFactoryFactory.deploy(
    getRainContractMetaBytes("flow")
  )) as FlowFactory;
  await flowFactory.deployed();
  return flowFactory;
};
