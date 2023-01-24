import { ethers } from "hardhat";
import { LibFixedPointMathTest } from "../../../../typechain/contracts/test/math/LibFixedPointMath/LibFixedPointMathTest";

export const fixedPointMathDeploy = async () => {
  const fixedPointMathTestFactory = await ethers.getContractFactory(
    "LibFixedPointMathTest"
  );
  const fixedPointMathTest =
    (await fixedPointMathTestFactory.deploy()) as LibFixedPointMathTest;
  await fixedPointMathTest.deployed();
  return fixedPointMathTest;
};
