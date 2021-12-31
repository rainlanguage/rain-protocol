/* eslint-disable @typescript-eslint/no-var-requires */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as Util from "../Util";
import { artifacts, ethers } from "hardhat";
import type { Contract } from "ethers";
import type {
  EmissionsERC20ConfigStruct,
  EmissionsERC20Factory,
} from "../../typechain/EmissionsERC20Factory";
import type { EmissionsERC20 } from "../../typechain/EmissionsERC20";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { getEventArgs } from "../Util";

export interface ClaimFactories {
  emissionsERC20Factory: EmissionsERC20Factory & Contract;
}

export const claimFactoriesDeploy = async (): Promise<ClaimFactories> => {
  const emissionsERC20FactoryFactory = await ethers.getContractFactory(
    "EmissionsERC20Factory"
  );
  const emissionsERC20Factory =
    (await emissionsERC20FactoryFactory.deploy()) as EmissionsERC20Factory &
      Contract;
  await emissionsERC20Factory.deployed();

  return {
    emissionsERC20Factory,
  };
};

export const emissionsDeploy = async (
  creator: SignerWithAddress,
  emissionsERC20Factory: EmissionsERC20Factory & Contract,
  emissionsERC20ConfigStruct: EmissionsERC20ConfigStruct
): Promise<EmissionsERC20 & Contract> => {
  const tx = await emissionsERC20Factory[
    "createChild((bool,(string,string),(bytes[],uint256[],uint256,uint256)))"
  ](emissionsERC20ConfigStruct);

  const emissionsERC20 = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(tx, "NewChild", emissionsERC20Factory.address))[1]
      ),
      20 // address bytes length
    ),
    (await artifacts.readArtifact("EmissionsERC20")).abi,
    creator
  ) as EmissionsERC20 & Contract;

  return emissionsERC20;
};

export function tierRange(startTier: number, endTier: number): number {
  //   op_.val & 0x0f, //     00001111
  //   op_.val & 0xf0, //     11110000

  if (startTier < 0 || startTier > 8) {
    throw new Error(`Invalid startTier ${startTier}`);
  } else if (endTier < 0 || endTier > 8) {
    throw new Error(`Invalid endTier ${endTier}`);
  }
  let range = endTier;
  range <<= 4;
  range += startTier;
  return range;
}

export function valOperand(index: number, forwardedVals?: boolean): number {
  //   op_.val & 0x7F, //     01111111
  //   op_.val & 0x80, //     10000000

  if (index < 0 || index > 15) {
    throw new Error(`Invalid index ${index}`);
  }
  let operand = forwardedVals ? 1 : 0;
  operand <<= 7;
  operand += index;
  return operand;
}
