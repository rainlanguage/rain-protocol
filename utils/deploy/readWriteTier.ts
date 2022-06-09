import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract } from "ethers";
import { ethers } from "hardhat";
import { ReadWriteTier } from "../../typechain/ReadWriteTier";

export const setup = async (): Promise<
  [SignerWithAddress[], ReadWriteTier & Contract]
> => {
  const signers = await ethers.getSigners();
  const readWriteTierFactory = await ethers.getContractFactory("ReadWriteTier");
  const readWriteTier = (await readWriteTierFactory.deploy()) as ReadWriteTier &
    Contract;
  await readWriteTier.deployed();
  return [signers, readWriteTier];
};
