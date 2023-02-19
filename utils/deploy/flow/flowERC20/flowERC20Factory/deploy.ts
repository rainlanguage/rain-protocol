import { ethers } from "hardhat";
import { FlowERC20Factory } from "../../../../../typechain/contracts/flow/erc20/FlowERC20Factory";
import { InterpreterCallerV1ConstructionConfigStruct } from "../../../../../typechain/contracts/flow/FlowCommon";
import { getRainContractMetaBytes } from "../../../../meta";
import { getTouchDeployer } from "../../../interpreter/shared/rainterpreterExpressionDeployer/deploy";

export const flowERC20FactoryDeploy = async () => {
  const flowFactoryFactory = await ethers.getContractFactory(
    "FlowERC20Factory",
    {}
  ); 
  const touchDeployer = await getTouchDeployer(); 
  const config_: InterpreterCallerV1ConstructionConfigStruct = {
    callerMeta: getRainContractMetaBytes("flow20"), 
    deployer: touchDeployer.address
  };
  const flowFactory = (await flowFactoryFactory.deploy(
    config_
  )) as FlowERC20Factory;
  await flowFactory.deployed();
  return flowFactory;
};
