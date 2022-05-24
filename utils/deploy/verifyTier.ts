import type { VerifyTier } from "../../typechain/VerifyTier";
import type {
  ImplementationEvent as ImplementationEventVerifyTierFactory,
  VerifyTierFactory,
} from "../../typechain/VerifyTierFactory";
import { artifacts, ethers } from "hardhat";
import { getEventArgs } from "../events";
import { zeroAddress } from "../constants";
import { Contract } from "ethers";
import { assert } from "chai";

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
  ) as VerifyTier & Contract;
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
