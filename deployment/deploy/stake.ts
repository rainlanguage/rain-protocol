import { ethers } from "hardhat";
import {
  RainterpreterExpressionDeployer,
  Stake as StakeType,
} from "../../typechain";
import { DeployerDiscoverableMetaV1ConstructionConfigStruct } from "../../typechain/contracts/factory/CloneFactory";
import { getRainMetaDocumentFromContract } from "../../utils";
import { registerContract } from "../utils";

export const deployStake = async (
  deployer_: RainterpreterExpressionDeployer
) => {
  const stakeFactory = await ethers.getContractFactory("Stake");

  const deployerDiscoverableMetaConfig: DeployerDiscoverableMetaV1ConstructionConfigStruct = {
    meta: getRainMetaDocumentFromContract("stake"),
    deployer: deployer_.address,
  };

  const Stake = (await stakeFactory.deploy(
    deployerDiscoverableMetaConfig
  )) as StakeType;

  registerContract("Stake", Stake.address, deployerDiscoverableMetaConfig);
};
