import { ethers } from "hardhat";
import { ReportOMeter } from "../../../../../../typechain/contracts/test/tier/ITierV2/ReportOMeter";

export const reportOMeterDeploy = async () => {
  const reportOMeterFactory = await ethers.getContractFactory(
    "ReportOMeter",
    {}
  );
  const reportOMeter = (await reportOMeterFactory.deploy()) as ReportOMeter;
  await reportOMeter.deployed();
  return reportOMeter;
};
