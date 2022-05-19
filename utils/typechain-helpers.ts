/// Helpers that depend on compiled typechain types

import { getEventArgs } from "./helpers";
import { zeroAddress } from "./constants";
import { artifacts, ethers } from "hardhat";
import chai from "chai";

import type { Factories } from "./interfaces";
import type { Contract } from "ethers";

import type {
  RedeemableERC20,
  RedeemableERC20ConfigStruct,
} from "../typechain/RedeemableERC20";
import type {
  ImplementationEvent as ImplementationEventRedeemableERC20Factory,
  RedeemableERC20Factory,
} from "../typechain/RedeemableERC20Factory";
import type { CombineTier } from "../typechain/CombineTier";
import type {
  CombineTierFactory,
  ImplementationEvent as ImplementationEventCombineTierFactory,
} from "../typechain/CombineTierFactory";
import type { Verify } from "../typechain/Verify";
import type {
  ImplementationEvent as ImplementationEventVerifyFactory,
  VerifyFactory,
} from "../typechain/VerifyFactory";
import type { VerifyTier } from "../typechain/VerifyTier";
import type {
  ImplementationEvent as ImplementationEventVerifyTierFactory,
  VerifyTierFactory,
} from "../typechain/VerifyTierFactory";
import type { BoundsStruct } from "../typechain/VMStateBuilder";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

const { assert } = chai;

export const factoriesDeploy = async (): Promise<Factories> => {
  const redeemableERC20FactoryFactory = await ethers.getContractFactory(
    "RedeemableERC20Factory",
    {}
  );
  const redeemableERC20Factory =
    (await redeemableERC20FactoryFactory.deploy()) as RedeemableERC20Factory &
      Contract;
  await redeemableERC20Factory.deployed();

  const { implementation: implementation0 } = (await getEventArgs(
    redeemableERC20Factory.deployTransaction,
    "Implementation",
    redeemableERC20Factory
  )) as ImplementationEventRedeemableERC20Factory["args"];
  assert(
    !(implementation0 === zeroAddress),
    "implementation redeemableERC20 factory zero address"
  );

  return {
    redeemableERC20Factory,
  };
};

export const verifyDeploy = async (deployer, config) => {
  const factoryFactory = await ethers.getContractFactory("VerifyFactory");
  const factory = (await factoryFactory.deploy()) as VerifyFactory;
  await factory.deployed();

  const { implementation } = (await getEventArgs(
    factory.deployTransaction,
    "Implementation",
    factory
  )) as ImplementationEventVerifyFactory["args"];
  assert(
    !(implementation === zeroAddress),
    "implementation verify factory zero address"
  );

  const tx = await factory.createChildTyped(config);
  const contract = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(tx, "NewChild", factory)).child
      ),
      20
    ),
    (await artifacts.readArtifact("Verify")).abi,
    deployer
  ) as Verify & Contract;
  await contract.deployed();
  return contract;
};

export const verifyTierDeploy = async (deployer, config) => {
  const factoryFactory = await ethers.getContractFactory("VerifyTierFactory");
  const factory = (await factoryFactory.deploy()) as VerifyTierFactory;
  await factory.deployed();
  const tx = await factory.createChildTyped(config);
  const contract = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(tx, "NewChild", factory)).child
      ),
      20
    ),
    (await artifacts.readArtifact("VerifyTier")).abi,
    deployer
  ) as VerifyTier & Contract;
  await contract.deployed();

  const { implementation } = (await getEventArgs(
    factory.deployTransaction,
    "Implementation",
    factory
  )) as ImplementationEventVerifyTierFactory["args"];
  assert(
    !(implementation === zeroAddress),
    "implementation verifyTier factory zero address"
  );

  return contract;
};

export const combineTierDeploy = async (deployer, config) => {
  const stateBuilderFactory = await ethers.getContractFactory(
    "AllStandardOpsStateBuilder"
  );
  const stateBuilder = await stateBuilderFactory.deploy();
  await stateBuilder.deployed();

  const factoryFactory = await ethers.getContractFactory("CombineTierFactory");
  const factory = (await factoryFactory.deploy(
    stateBuilder.address
  )) as CombineTierFactory;
  await factory.deployed();

  const { implementation } = (await getEventArgs(
    factory.deployTransaction,
    "Implementation",
    factory
  )) as ImplementationEventCombineTierFactory["args"];
  assert(
    !(implementation === zeroAddress),
    "implementation combineTier factory zero address"
  );

  const tx = await factory.createChildTyped(config);
  const contract = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(tx, "NewChild", factory)).child
      ),
      20
    ),
    (await artifacts.readArtifact("CombineTier")).abi,
    deployer
  ) as CombineTier & Contract;
  await contract.deployed();

  return contract;
};

export const redeemableERC20Deploy = async (
  deployer: SignerWithAddress,
  config: RedeemableERC20ConfigStruct
) => {
  const redeemableERC20FactoryFactory = await ethers.getContractFactory(
    "RedeemableERC20Factory"
  );
  const redeemableERC20Factory =
    (await redeemableERC20FactoryFactory.deploy()) as RedeemableERC20Factory;
  await redeemableERC20Factory.deployed();

  const { implementation } = (await getEventArgs(
    redeemableERC20Factory.deployTransaction,
    "Implementation",
    redeemableERC20Factory
  )) as ImplementationEventRedeemableERC20Factory["args"];
  assert(
    !(implementation === zeroAddress),
    "implementation redeemableERC20 factory zero address"
  );

  const txDeploy = await redeemableERC20Factory.createChildTyped(config);
  const redeemableERC20 = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(txDeploy, "NewChild", redeemableERC20Factory)).child
      ),
      20
    ),
    (await artifacts.readArtifact("RedeemableERC20")).abi,
    deployer
  ) as RedeemableERC20 & Contract;

  await redeemableERC20.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  redeemableERC20.deployTransaction = txDeploy;

  return redeemableERC20;
};

export const newVMStateBuilderBounds = (): BoundsStruct => {
  return {
    entrypoint: 0,
    minFinalStackIndex: 0,
    stackIndex: 0,
    stackLength: 0,
    argumentsLength: 0,
    storageLength: 0,
    opcodesLength: 0,
  };
};
