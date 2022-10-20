import { ethers } from "hardhat";
import { AllStandardOpsTest } from "../../../../typechain/contracts/test/interpreter/ops/AllStandardOps/AllStandardOpsTest";
import { standardIntegrityDeploy } from "../../interpreter/integrity/standardIntegrity/deploy";

export const allStandardOpsDeploy = async () => {
  const integrity = await standardIntegrityDeploy();

  const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
  return (await logicFactory.deploy(integrity.address)) as AllStandardOpsTest;
};
