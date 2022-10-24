import { ethers } from "hardhat";
import { FlowERC1155Factory } from "../../../../../typechain/contracts/flow/erc1155/FlowERC1155Factory";
import { flowIntegrityDeploy } from "../../interpreter/integrity/flowIntegrity/deploy";

export const flowERC1155FactoryDeploy = async () => {
  const integrity = await flowIntegrityDeploy();

  const flowFactoryFactory = await ethers.getContractFactory(
    "FlowERC1155Factory",
    {}
  );
  const flowFactory = (await flowFactoryFactory.deploy(
    integrity.address
  )) as FlowERC1155Factory;
  await flowFactory.deployed();
  return flowFactory;
};
