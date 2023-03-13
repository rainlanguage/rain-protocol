import { ethers } from "hardhat";
import {
  FlowERC20 as FlowERC20Type,
  RainterpreterExpressionDeployer,
} from "../../typechain";
import { InterpreterCallerV1ConstructionConfigStruct } from "../../typechain/contracts/flow/FlowCommon";
import { getRainMetaDocumentFromContract } from "../../utils";
import { registerContract } from "../utils";

export const deployFlowErc20 = async (
  deployer_: RainterpreterExpressionDeployer
) => {
  const flowFactory = await ethers.getContractFactory("FlowERC20");

  const interpreterCallerConfig: InterpreterCallerV1ConstructionConfigStruct = {
    meta: getRainMetaDocumentFromContract("flow20"),
    deployer: deployer_.address,
  };

  const FlowERC20 = (await flowFactory.deploy(
    interpreterCallerConfig
  )) as FlowERC20Type;

  registerContract("FlowERC20", FlowERC20.address);
};
