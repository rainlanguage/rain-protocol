import { assert } from "chai";
import { ethers } from "hardhat";
import * as Util from "..";
import { getEventArgs } from "..";
import {
  EmissionsERC20Factory,
  ImplementationEvent as ImplementationEventEmissionsERC20Factory,
} from "../../typechain/EmissionsERC20Factory";

export interface ClaimFactories {
  emissionsERC20Factory: EmissionsERC20Factory;
}

export const claimFactoriesDeploy = async (): Promise<ClaimFactories> => {
  const integrityFactory = await ethers.getContractFactory(
    "StandardIntegrity"
  );
  const integrity = await integrityFactory.deploy();
  await integrity.deployed();

  const emissionsERC20FactoryFactory = await ethers.getContractFactory(
    "EmissionsERC20Factory"
  );
  const emissionsERC20Factory = (await emissionsERC20FactoryFactory.deploy(
    integrity.address
  )) as EmissionsERC20Factory;
  await emissionsERC20Factory.deployed();

  const { implementation } = (await getEventArgs(
    emissionsERC20Factory.deployTransaction,
    "Implementation",
    emissionsERC20Factory
  )) as ImplementationEventEmissionsERC20Factory["args"];
  assert(
    !(implementation === Util.zeroAddress),
    "implementation emissionsERC20 factory zero address"
  );

  return {
    emissionsERC20Factory,
  };
};
