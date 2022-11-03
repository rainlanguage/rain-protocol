import { ethers } from "hardhat";
import { RedeemableERC20Factory } from "../../../../typechain/contracts/redeemableERC20/RedeemableERC20Factory";

export const redeemableERC20FactoryDeploy = async () => {
  const redeemableERC20FactoryFactory = await ethers.getContractFactory(
    "RedeemableERC20Factory",
    {}
  );
  const redeemableERC20Factory =
    (await redeemableERC20FactoryFactory.deploy()) as RedeemableERC20Factory;
  await redeemableERC20Factory.deployed();
  return redeemableERC20Factory;
};
