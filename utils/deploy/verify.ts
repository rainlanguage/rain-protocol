import type { Verify } from "../../typechain/Verify";
import type {
  ImplementationEvent as ImplementationEventVerifyFactory,
  VerifyFactory,
} from "../../typechain/VerifyFactory";
import { artifacts, ethers } from "hardhat";
import { getEventArgs } from "../events";
import { zeroAddress } from "../constants";
import { Contract } from "ethers";
import { assert } from "chai";

export const verifyDeploy = async (deployer, config) => {
  const factoryFactory = await ethers.getContractFactory("VerifyFactory");
  const factory = (await factoryFactory.deploy()) as VerifyFactory;
  await factory.deployed();

  const { implementation } = (await getEventArgs(
    factory.deployTransaction,
    "Implementation",
    factory
  )) as ImplementationEventVerifyFactory["args"];
  assert(
    !(implementation === zeroAddress),
    "implementation verify factory zero address"
  );

  const tx = await factory.createChildTyped(config);
  const contract = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(tx, "NewChild", factory)).child
      ),
      20
    ),
    (await artifacts.readArtifact("Verify")).abi,
    deployer
  ) as Verify & Contract;
  await contract.deployed();
  return contract;
};
