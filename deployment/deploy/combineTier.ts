import { ethers } from "hardhat";
import {
  CombineTier as CombineTierType,
  RainterpreterExpressionDeployer,
} from "../../typechain";
import { DeployerDiscoverableMetaV1ConstructionConfigStruct } from "../../typechain/contracts/factory/CloneFactory";
import { getRainMetaDocumentFromContract } from "../../utils";
import { registerContract } from "../utils";

export const deployCombineTier = async (
  deployer_: RainterpreterExpressionDeployer
) => {
  const combineTierFactory = await ethers.getContractFactory("CombineTier");

  const config_: DeployerDiscoverableMetaV1ConstructionConfigStruct = {
    meta: getRainMetaDocumentFromContract("combinetier"),
    deployer: deployer_.address,
  };

  const CombineTier = (await combineTierFactory.deploy(
    config_
  )) as CombineTierType;

  registerContract("CombineTier", CombineTier.address, config_);
};
