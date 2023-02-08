import { ethers } from "hardhat";
import { FlowERC1155Factory } from "../../../../../typechain/contracts/flow/erc1155/FlowERC1155Factory";
import { getRainContractMetaBytes } from "../../../../meta";

export const flowERC1155FactoryDeploy = async () => {
  const flowFactoryFactory = await ethers.getContractFactory(
    "FlowERC1155Factory",
    {}
  );
  const flowFactory = (await flowFactoryFactory.deploy(
    getRainContractMetaBytes("flow1155")
  )) as FlowERC1155Factory;
  await flowFactory.deployed();
  return flowFactory;
};
