import { ethers } from "hardhat";
import {
  Flow as FlowType,
  RainterpreterExpressionDeployer,
} from "../../typechain";
import { DeployerDiscoverableMetaV1ConstructionConfigStruct } from "../../typechain/contracts/factory/CloneFactory";
import { getRainMetaDocumentFromContract } from "../../utils";
import { registerContract } from "../utils";

export const deployFlow = async (
  deployer_: RainterpreterExpressionDeployer
) => {
  const flowFactory = await ethers.getContractFactory("Flow");

  const config_: DeployerDiscoverableMetaV1ConstructionConfigStruct = {
    meta: getRainMetaDocumentFromContract("flow"),
    deployer: deployer_.address,
  };

  const Flow = (await flowFactory.deploy(config_)) as FlowType;

  registerContract("Flow", Flow.address, config_);
};
