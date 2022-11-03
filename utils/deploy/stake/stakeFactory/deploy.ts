import { ethers } from "hardhat";
import { StakeFactory } from "../../../../typechain/contracts/stake/StakeFactory";

export const stakeFactoryDeploy = async () => {
  const stakeFactoryFactory = await ethers.getContractFactory(
    "StakeFactory",
    {}
  );
  const stakeFactory = (await stakeFactoryFactory.deploy()) as StakeFactory;
  await stakeFactory.deployed();
  return stakeFactory;
};
