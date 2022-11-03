import { ethers } from "hardhat";
import { LibIdempotentFlagTest } from "../../../../typechain/contracts/test/idempotent/LibIdempotentFlag/LibIdempotentFlagTest";

export const libIdempotentFlagDeploy = async () => {
  const libIdempotentFlagFactory = await ethers.getContractFactory(
    "LibIdempotentFlagTest"
  );
  const libIdempotentFlag =
    (await libIdempotentFlagFactory.deploy()) as LibIdempotentFlagTest;
  await libIdempotentFlag.deployed();
  return libIdempotentFlag;
};
