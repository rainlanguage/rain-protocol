import { ethers } from "hardhat";
import { FlowIntegrity } from "../../../../../../typechain/contracts/flow/interpreter/FlowIntegrity";

export const flowIntegrityDeploy = async () => {
  const integrityFactory = await ethers.getContractFactory("FlowIntegrity");
  const integrity = (await integrityFactory.deploy()) as FlowIntegrity;
  await integrity.deployed();
  return integrity;
};
