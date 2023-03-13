import { ethers } from "hardhat";
import { CloneFactory } from "../../typechain";
import { registerContract } from "../utils";

export const deployCloneFactory = async () => {
  const CloneFactory = (await (
    await ethers.getContractFactory("CloneFactory")
  ).deploy()) as CloneFactory;

  registerContract("CloneFactory", CloneFactory.address);

  return CloneFactory;
};
