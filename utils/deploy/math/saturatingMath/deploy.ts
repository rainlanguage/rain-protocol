import { ethers } from "hardhat";
import { SaturatingMathTest } from "../../../../typechain/contracts/test/math/SaturatingMath/SaturatingMathTest";

export const saturatingMathDeploy = async () => {
  const saturatingMathTestFactory = await ethers.getContractFactory(
    "SaturatingMathTest"
  );
  const saturatingMathTest =
    (await saturatingMathTestFactory.deploy()) as SaturatingMathTest;
  await saturatingMathTest.deployed();
  return saturatingMathTest;
};
