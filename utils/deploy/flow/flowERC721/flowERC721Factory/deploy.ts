import { ethers } from "hardhat";
import { FlowERC721Factory } from "../../../../../typechain/contracts/flow/erc721/FlowERC721Factory";
import { InterpreterCallerV1ConstructionConfigStruct } from "../../../../../typechain/contracts/flow/FlowCommon";
import { getRainContractMetaBytes } from "../../../../meta";
import { getTouchDeployer } from "../../../interpreter/shared/rainterpreterExpressionDeployer/deploy";

export const flowERC721FactoryDeploy = async () => {
  const flowFactoryFactory = await ethers.getContractFactory(
    "FlowERC721Factory",
    {}
  ); 
  const touchDeployer = await getTouchDeployer(); 
  const config_: InterpreterCallerV1ConstructionConfigStruct = {
    callerMeta: getRainContractMetaBytes("flow721"), 
    deployer: touchDeployer.address
  };   
  const flowFactory = (await flowFactoryFactory.deploy(
    config_
  )) as FlowERC721Factory;
  await flowFactory.deployed();
  return flowFactory;
};
