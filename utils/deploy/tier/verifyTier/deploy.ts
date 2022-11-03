import { assert } from "chai";
import { artifacts, ethers } from "hardhat";
import type { VerifyTier, VerifyTierFactory } from "../../../../typechain";
import { ImplementationEvent as ImplementationEventVerifyTierFactory } from "../../../../typechain/contracts/tier/VerifyTierFactory";
import { zeroAddress } from "../../../constants";
import { getEventArgs } from "../../../events";

export const verifyTierDeploy = async (deployer, config) => {
  const factoryFactory = await ethers.getContractFactory("VerifyTierFactory");
  const factory = (await factoryFactory.deploy()) as VerifyTierFactory;
  await factory.deployed();
  const tx = await factory.createChildTyped(config);
  const contract = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(tx, "NewChild", factory)).child
      ),
      20
    ),
    (await artifacts.readArtifact("VerifyTier")).abi,
    deployer
  ) as VerifyTier;
  await contract.deployed();

  const { implementation } = (await getEventArgs(
    factory.deployTransaction,
    "Implementation",
    factory
  )) as ImplementationEventVerifyTierFactory["args"];
  assert(
    !(implementation === zeroAddress),
    "implementation verifyTier factory zero address"
  );

  return contract;
};
