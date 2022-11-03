import { ethers } from "hardhat";
import { CooldownTest } from "../../../../typechain/contracts/test/cooldown/CooldownTest";

export const cooldownDeploy = async () => {
  const cooldownTestFactory = await ethers.getContractFactory("CooldownTest");
  const cooldownTest = (await cooldownTestFactory.deploy()) as CooldownTest;
  await cooldownTest.deployed();
  return cooldownTest;
};
