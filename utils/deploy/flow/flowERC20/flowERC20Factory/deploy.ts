import { ethers } from "hardhat";
import { FlowERC20Factory } from "../../../../../typechain/contracts/flow/erc20/FlowERC20Factory";
import { getRainContractMetaBytes } from "../../../../meta";

export const flowERC20FactoryDeploy = async () => {
  const flowFactoryFactory = await ethers.getContractFactory(
    "FlowERC20Factory",
    {}
  );
  const flowFactory = (await flowFactoryFactory.deploy(
    getRainContractMetaBytes("flow20")
  )) as FlowERC20Factory;
  await flowFactory.deployed();
  return flowFactory;
};
