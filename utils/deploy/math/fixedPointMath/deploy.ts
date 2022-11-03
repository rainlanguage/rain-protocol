import { ethers } from "hardhat";
import { FixedPointMathTest } from "../../../../typechain/contracts/test/math/FixedPointMath/FixedPointMathTest";

export const fixedPointMathDeploy = async () => {
  const fixedPointMathTestFactory = await ethers.getContractFactory(
    "FixedPointMathTest"
  );
  const fixedPointMathTest =
    (await fixedPointMathTestFactory.deploy()) as FixedPointMathTest;
  await fixedPointMathTest.deployed();
  return fixedPointMathTest;
};
