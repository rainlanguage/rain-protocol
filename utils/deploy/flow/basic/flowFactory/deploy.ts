import { ethers } from "hardhat";
import { FlowFactory } from "../../../../../typechain/contracts/flow/basic/FlowFactory";
import { flowIntegrityDeploy } from "../../interpreter/integrity/flowIntegrity/deploy";

export const flowFactoryDeploy = async () => {
  const integrity = await flowIntegrityDeploy();

  const flowFactoryFactory = await ethers.getContractFactory("FlowFactory", {});
  const flowFactory = (await flowFactoryFactory.deploy(
    integrity.address
  )) as FlowFactory;
  await flowFactory.deployed();
  return flowFactory;
};
