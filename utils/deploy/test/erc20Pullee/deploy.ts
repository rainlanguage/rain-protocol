import { ethers } from "hardhat";
import { ERC20PulleeTest } from "../../../../typechain/contracts/test/redeemableERC20/RedeemableERC20/ERC20PulleeTest";

export const erc20PulleeDeploy = async () => {
  const erc20PulleeFactory = await ethers.getContractFactory("ERC20PulleeTest");
  const erc20Pullee = (await erc20PulleeFactory.deploy()) as ERC20PulleeTest;
  await erc20Pullee.deployed();
  return erc20Pullee;
};
