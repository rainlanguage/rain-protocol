import { ethers } from "hardhat";
import {
  CombineTier as CombineTierType,
  RainterpreterExpressionDeployer,
} from "../../typechain";
import { InterpreterCallerV1ConstructionConfigStruct } from "../../typechain/contracts/flow/FlowCommon";
import { getRainMetaDocumentFromContract } from "../../utils";
import { registerContract } from "../utils";
import { verifyContract } from "../verify";

export const deployCombineTier = async (
  deployer_: RainterpreterExpressionDeployer
) => {
  const combineTierFactory = await ethers.getContractFactory("CombineTier");

  const config_: InterpreterCallerV1ConstructionConfigStruct = {
    meta: getRainMetaDocumentFromContract("combinetier"),
    deployer: deployer_.address,
  };

  const CombineTier = (await combineTierFactory.deploy(
    config_
  )) as CombineTierType;

  registerContract("CombineTier", CombineTier.address);
  verifyContract("CombineTier", CombineTier.address, config_);
};
