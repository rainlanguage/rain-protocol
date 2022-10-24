import { ethers } from "hardhat";
import { LibInterpreterStateTest } from "../../../../typechain/contracts/test/interpreter/runtime/LibInterpreterState/LibInterpreterStateTest";
import { standardIntegrityDeploy } from "../../interpreter/integrity/standardIntegrity/deploy";

export const libInterpreterStateDeploy = async () => {
  const integrity = await standardIntegrityDeploy();

  const libInterpreterStateFactory = await ethers.getContractFactory(
    "LibInterpreterStateTest"
  );
  const libInterpreterState = (await libInterpreterStateFactory.deploy(
    integrity.address
  )) as LibInterpreterStateTest;
  await libInterpreterState.deployed();
  return libInterpreterState;
};
