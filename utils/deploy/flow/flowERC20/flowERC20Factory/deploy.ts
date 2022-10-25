import { ethers } from "hardhat";
import { FlowERC20Factory } from "../../../../../typechain/contracts/flow/erc20/FlowERC20Factory";
import { standardIntegrityDeploy } from "../../../interpreter/integrity/standardIntegrity/deploy";

export const flowERC20FactoryDeploy = async () => {
  const integrity = await standardIntegrityDeploy();

  const flowFactoryFactory = await ethers.getContractFactory(
    "FlowERC20Factory",
    {}
  );
  const flowFactory = (await flowFactoryFactory.deploy(
    integrity.address
  )) as FlowERC20Factory;
  await flowFactory.deployed();
  return flowFactory;
};
