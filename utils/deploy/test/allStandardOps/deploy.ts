import { ethers } from "hardhat";
import { AllStandardOpsStandaloneTest } from "../../../../typechain/contracts/test/interpreter/ops/AllStandardOps";
import { AllStandardOpsTest } from "../../../../typechain/contracts/test/interpreter/ops/AllStandardOps/AllStandardOpsTest";
import { standardIntegrityDeploy } from "../../interpreter/integrity/standardIntegrity/deploy";

export const allStandardOpsDeploy = async () => {
  const integrity = await standardIntegrityDeploy();

  const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
  const logic = (await logicFactory.deploy(
    integrity.address
  )) as AllStandardOpsTest;
  await logic.deployed();
  return logic;
};

export const allStandardOpsStandaloneDeploy = async () => {
  const logicFactory = await ethers.getContractFactory(
    "AllStandardOpsStandaloneTest"
  );
  const logic = (await logicFactory.deploy()) as AllStandardOpsStandaloneTest;
  await logic.deployed();
  return logic;
};
