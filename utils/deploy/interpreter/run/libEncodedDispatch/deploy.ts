import { ethers } from "hardhat";
import { LibEncodedDispatchTest } from "../../../../../typechain/contracts/test/interpreter/runtime/LibEncodedDispatch/LibEncodedDispatchTest";

export const libEncodedDispatchDeploy = async () => {
  const libEncodedDispatchFactory = await ethers.getContractFactory(
    "LibEncodedDispatchTest"
  );
  const libEncodedDispatch =
    (await libEncodedDispatchFactory.deploy()) as LibEncodedDispatchTest;
  await libEncodedDispatch.deployed();
  return libEncodedDispatch;
};
