import { ethers } from "hardhat";
import { LibEvidenceTest } from "../../../../typechain/contracts/test/verify/LibEvidence/LibEvidenceTest";

export const libEvidenceDeploy = async () => {
  const libEvidenceFactory = await ethers.getContractFactory("LibEvidenceTest");
  const libEvidence = (await libEvidenceFactory.deploy()) as LibEvidenceTest;
  await libEvidence.deployed();
  return libEvidence;
};
