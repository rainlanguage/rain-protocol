import { ethers } from "hardhat";
import { CloneFactory, RainterpreterExpressionDeployer } from "../../typechain";
import { DeployerDiscoverableMetaV1ConstructionConfigStruct } from "../../typechain/contracts/factory/CloneFactory";
import { getCloneFactoryMeta, registerContract } from "../utils";

export const deployCloneFactory = async (
  deployer_: RainterpreterExpressionDeployer
) => {
  const config_: DeployerDiscoverableMetaV1ConstructionConfigStruct = {
    meta: getCloneFactoryMeta(),
    deployer: deployer_.address,
  };

  const CloneFactory = (await (
    await ethers.getContractFactory("CloneFactory")
  ).deploy(config_)) as CloneFactory;

  await CloneFactory.deployed();

  registerContract("CloneFactory", CloneFactory.address);

  return CloneFactory;
};
