import { ethers } from "hardhat";
import { FlowERC1155Factory } from "../../../../../typechain/contracts/flow/erc1155/FlowERC1155Factory";
import { InterpreterCallerV1ConstructionConfigStruct } from "../../../../../typechain/contracts/flow/FlowCommon";
import { getRainContractMetaBytes } from "../../../../meta";
import { getTouchDeployer } from "../../../interpreter/shared/rainterpreterExpressionDeployer/deploy";

export const flowERC1155FactoryDeploy = async () => {
  const flowFactoryFactory = await ethers.getContractFactory(
    "FlowERC1155Factory",
    {}
  ); 
  const touchDeployer = await getTouchDeployer(); 
  const config_: InterpreterCallerV1ConstructionConfigStruct = {
    callerMeta: getRainContractMetaBytes("flow1155"), 
    deployer: touchDeployer.address
  };   
  const flowFactory = (await flowFactoryFactory.deploy(
    config_
  )) as FlowERC1155Factory;
  await flowFactory.deployed();
  return flowFactory;
};
