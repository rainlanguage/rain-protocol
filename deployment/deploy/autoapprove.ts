import { ethers } from "hardhat";
import {
  AutoApprove as AutoApproveType,
  RainterpreterExpressionDeployer,
} from "../../typechain";
import { InterpreterCallerV1ConstructionConfigStruct } from "../../typechain/contracts/flow/FlowCommon";
import { getRainMetaDocumentFromContract } from "../../utils";
import { registerContract } from "../utils";
import { verifyContract } from "../verify";

export const deployAutoApprove = async (
  deployer_: RainterpreterExpressionDeployer
) => {
  const contractFactory = await ethers.getContractFactory("AutoApprove");

  const config_: InterpreterCallerV1ConstructionConfigStruct = {
    meta: getRainMetaDocumentFromContract("autoapprove"),
    deployer: deployer_.address,
  };

  const AutoApprove = (await contractFactory.deploy(
    config_
  )) as AutoApproveType;

  registerContract("AutoApprove", AutoApprove.address);
  verifyContract("AutoApprove", AutoApprove.address, config_);
};
