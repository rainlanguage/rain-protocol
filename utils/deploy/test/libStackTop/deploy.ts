import { ethers } from "hardhat";
import { LibStackTopTest } from "../../../../typechain/contracts/test/interpreter/runtime/LibStackTop/LibStackTopTest";

export const libStackTopDeploy = async () => {
  const libStackTopFactory = await ethers.getContractFactory("LibStackTopTest");
  const libStackTopTest =
    (await libStackTopFactory.deploy()) as LibStackTopTest;
  await libStackTopTest.deployed();
  return libStackTopTest;
};
