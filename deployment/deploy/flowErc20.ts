import { ethers } from "hardhat";
import {
  FlowERC20 as FlowERC20Type,
  RainterpreterExpressionDeployer,
} from "../../typechain";
import { DeployerDiscoverableMetaV1ConstructionConfigStruct } from "../../typechain/contracts/flow/FlowCommon";
import { getRainMetaDocumentFromContract } from "../../utils";
import { registerContract } from "../utils";

export const deployFlowErc20 = async (
  deployer_: RainterpreterExpressionDeployer
) => {
  const flowFactory = await ethers.getContractFactory("FlowERC20");

  const deployerDiscoverableMetaConfig: DeployerDiscoverableMetaV1ConstructionConfigStruct = {
    meta: getRainMetaDocumentFromContract("flow20"),
    deployer: deployer_.address,
  };

  const FlowERC20 = (await flowFactory.deploy(
    deployerDiscoverableMetaConfig
  )) as FlowERC20Type;

  registerContract("FlowERC20", FlowERC20.address, deployerDiscoverableMetaConfig);
};
