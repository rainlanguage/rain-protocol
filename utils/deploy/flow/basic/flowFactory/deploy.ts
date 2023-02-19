import { ethers } from "hardhat";
import { FlowFactory } from "../../../../../typechain/contracts/flow/basic/FlowFactory";
import { InterpreterCallerV1ConstructionConfigStruct } from "../../../../../typechain/contracts/flow/FlowCommon";
import { getRainContractMetaBytes } from "../../../../meta";
import { getTouchDeployer } from "../../../interpreter/shared/rainterpreterExpressionDeployer/deploy";

export const flowFactoryDeploy = async () => {
  const flowFactoryFactory = await ethers.getContractFactory("FlowFactory", {}); 
  const touchDeployer = await getTouchDeployer(); 
  const config_: InterpreterCallerV1ConstructionConfigStruct = {
    callerMeta: getRainContractMetaBytes("flow"), 
    deployer: touchDeployer.address
  };  

  const flowFactory = (await flowFactoryFactory.deploy(
    config_
  )) as FlowFactory;
  await flowFactory.deployed();
  return flowFactory;
};
