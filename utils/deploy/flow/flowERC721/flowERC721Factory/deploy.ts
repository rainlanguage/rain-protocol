import { ethers } from "hardhat";
import { FlowERC721Factory } from "../../../../../typechain/contracts/flow/erc721/FlowERC721Factory";
import { flowIntegrityDeploy } from "../../interpreter/integrity/flowIntegrity/deploy";

export const flowERC721FactoryDeploy = async () => {
  const integrity = await flowIntegrityDeploy();

  const flowFactoryFactory = await ethers.getContractFactory(
    "FlowERC721Factory",
    {}
  );
  const flowFactory = (await flowFactoryFactory.deploy(
    integrity.address
  )) as FlowERC721Factory;
  await flowFactory.deployed();
  return flowFactory;
};
