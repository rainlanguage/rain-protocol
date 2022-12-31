import { ethers } from "hardhat";
import { LibInterpreterStateTest } from "../../../../typechain/contracts/test/interpreter/runtime/LibInterpreterState/LibInterpreterStateTest";

export const libInterpreterStateDeploy = async () => {
  const libInterpreterStateFactory = await ethers.getContractFactory(
    "LibInterpreterStateTest"
  );
  const libInterpreterState =
    (await libInterpreterStateFactory.deploy()) as LibInterpreterStateTest;
  await libInterpreterState.deployed();
  return libInterpreterState;
};
