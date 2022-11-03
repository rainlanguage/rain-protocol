import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Overrides } from "ethers";
import { artifacts, ethers } from "hardhat";
import { Stake, StakeFactory } from "../../../typechain";
import { StakeConfigStruct } from "../../../typechain/contracts/stake/Stake";
import { getEventArgs } from "../../events";

export const stakeDeploy = async (
  deployer: SignerWithAddress,
  stakeFactory: StakeFactory,
  stakeConfigStruct: StakeConfigStruct,
  ...args: Overrides[]
): Promise<Stake> => {
  const txDeploy = await stakeFactory.createChildTyped(
    stakeConfigStruct,
    ...args
  );

  const stake = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(txDeploy, "NewChild", stakeFactory)).child
      ),
      20 // address bytes length
    ),
    (await artifacts.readArtifact("Stake")).abi,
    deployer
  ) as Stake;

  await stake.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  stake.deployTransaction = txDeploy;

  return stake;
};
