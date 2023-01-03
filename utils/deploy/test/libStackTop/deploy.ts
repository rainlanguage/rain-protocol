import { ethers } from "hardhat";
import { LibStackPointerTest } from "../../../../typechain/contracts/test/interpreter/runtime/LibStackPointer/LibStackPointerTest";

export const libStackPointerDeploy = async () => {
  const libStackPointerFactory = await ethers.getContractFactory(
    "LibStackPointerTest"
  );
  const libStackPointerTest =
    (await libStackPointerFactory.deploy()) as LibStackPointerTest;
  await libStackPointerTest.deployed();
  return libStackPointerTest;
};
