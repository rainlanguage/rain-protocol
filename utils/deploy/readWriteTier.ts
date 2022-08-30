import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { ReadWriteTier } from "../../typechain";

export const deployReadWriteTier = async (): Promise<
  [SignerWithAddress[], ReadWriteTier]
> => {
  const signers = await ethers.getSigners();
  const readWriteTierFactory = await ethers.getContractFactory("ReadWriteTier");
  const readWriteTier = (await readWriteTierFactory.deploy()) as ReadWriteTier;
  await readWriteTier.deployed();
  return [signers, readWriteTier];
};
