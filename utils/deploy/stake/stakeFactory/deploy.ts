import { ethers } from "hardhat";
import { StakeFactory } from "../../../../typechain/contracts/stake/StakeFactory";
import { getRainContractMetaBytes } from "../../../meta";

export const stakeFactoryDeploy = async () => {
  const stakeFactoryFactory = await ethers.getContractFactory(
    "StakeFactory",
    {}
  );
  const stakeFactory = (await stakeFactoryFactory.deploy(
    getRainContractMetaBytes("sale")
  )) as StakeFactory;
  await stakeFactory.deployed();
  return stakeFactory;
};
