import { ethers } from "hardhat";
import { LibIntegrityCheckTest } from "../../../../typechain/contracts/test/interpreter/integrity/LibIntegrityState/LibIntegrityStateTest.sol/LibIntegrityCheckTest";

export const libIntegrityCheckStateDeploy = async () => {
  const libIntegrityCheckStateFactory = await ethers.getContractFactory(
    "LibIntegrityCheckTest"
  );
  const libIntegrityCheckState =
    (await libIntegrityCheckStateFactory.deploy()) as LibIntegrityCheckTest;
  await libIntegrityCheckState.deployed();
  return libIntegrityCheckState;
};
