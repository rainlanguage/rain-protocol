import { ethers } from "hardhat";
import { LibIntegrityStateTest } from "../../../../typechain/contracts/test/interpreter/integrity/LibIntegrityState/LibIntegrityStateTest";

export const libIntegrityStateDeploy = async () => {
  const libIntegrityStateFactory = await ethers.getContractFactory(
    "LibIntegrityStateTest"
  );
  const libIntegrityState =
    (await libIntegrityStateFactory.deploy()) as LibIntegrityStateTest;
  await libIntegrityState.deployed();
  return libIntegrityState;
};
