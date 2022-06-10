import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract, Overrides } from "ethers";
import { artifacts, ethers } from "hardhat";
import { Stake, StakeConfigStruct } from "../../typechain/Stake";
import { StakeFactory } from "../../typechain/StakeFactory";
import { getEventArgs } from "../events";

export const stakeDeploy = async (
  deployer: SignerWithAddress,
  stakeFactory: StakeFactory & Contract,
  stakeConfigStruct: StakeConfigStruct,
  ...args: Overrides[]
): Promise<Stake & Contract> => {
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
  ) as Stake & Contract;

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  stake.deployTransaction = txDeploy;

  return stake;
};
