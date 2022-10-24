import { ethers } from "hardhat";
import { FlowERC20Factory } from "../../../../../typechain/contracts/flow/erc20/FlowERC20Factory";
import { flowIntegrityDeploy } from "../../interpreter/integrity/flowIntegrity/deploy";

export const flowERC20FactoryDeploy = async () => {
  const integrity = await flowIntegrityDeploy();

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
