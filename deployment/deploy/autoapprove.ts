import { ethers } from "hardhat";
import {
  AutoApprove as AutoApproveType,
  RainterpreterExpressionDeployer,
} from "../../typechain";
import { DeployerDiscoverableMetaV1ConstructionConfigStruct } from "../../typechain/contracts/factory/CloneFactory";
import { getRainMetaDocumentFromContract } from "../../utils";
import { registerContract } from "../utils";

export const deployAutoApprove = async (
  deployer_: RainterpreterExpressionDeployer
) => {
  const contractFactory = await ethers.getContractFactory("AutoApprove");

  const config_: DeployerDiscoverableMetaV1ConstructionConfigStruct = {
    meta: getRainMetaDocumentFromContract("autoapprove"),
    deployer: deployer_.address,
  };

  const AutoApprove = (await contractFactory.deploy(
    config_
  )) as AutoApproveType;

  registerContract("AutoApprove", AutoApprove.address, config_);
};
