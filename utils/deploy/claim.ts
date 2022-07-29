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
  const stateBuilderFactory = await ethers.getContractFactory(
    "AllStandardOpsIntegrity"
  );
  const stateBuilder = await stateBuilderFactory.deploy();
  await stateBuilder.deployed();

  const emissionsERC20FactoryFactory = await ethers.getContractFactory(
    "EmissionsERC20Factory"
  );
  const emissionsERC20Factory = (await emissionsERC20FactoryFactory.deploy(
    stateBuilder.address
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
