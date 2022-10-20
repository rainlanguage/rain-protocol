import { ethers } from "hardhat";
import { CooldownTest } from "../../../../typechain/contracts/test/cooldown/CooldownTest";

export const cooldownDeploy = async () => {
  const CooldownTestFactory = await ethers.getContractFactory("CooldownTest");
  return (await CooldownTestFactory.deploy()) as CooldownTest;
};
