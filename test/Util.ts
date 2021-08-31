import { ethers, artifacts } from "hardhat";
import type { RightsManager } from "../typechain/RightsManager";
import type { CRPFactory } from "../typechain/CRPFactory";
import type { BFactory } from "../typechain/BFactory";
import chai from "chai";
import type { RedeemableERC20Pool } from "../typechain/RedeemableERC20Pool";
import type { ConfigurableRightsPool } from "../typechain/ConfigurableRightsPool";
import type { BPool } from "../typechain/BPool";
import type { BigNumber } from "ethers";
import type { SmartPoolManager } from "../typechain/SmartPoolManager";

const { expect, assert } = chai;

const smartPoolManagerAddress = process.env.BALANCER_SMART_POOL_MANAGER;
if (smartPoolManagerAddress) {
  console.log(`using existing SmartPoolManager: ${smartPoolManagerAddress}`);
}
const balancerSafeMathAddress = process.env.BALANCER_SAFE_MATH;
if (balancerSafeMathAddress) {
  console.log(`using existing BalancerSafeMath: ${balancerSafeMathAddress}`);
}
const rightsManagerAddress = process.env.BALANCER_RIGHTS_MANAGER;
if (rightsManagerAddress) {
  console.log(`using existing RightsManager: ${rightsManagerAddress}`);
}
const bFactoryAddress = process.env.BALANCER_BFACTORY;
if (bFactoryAddress) {
  console.log(`using existing BFactory: ${bFactoryAddress}`);
}
const crpFactoryAddress = process.env.BALANCER_CRP_FACTORY;
if (crpFactoryAddress) {
  console.log(`using existing CRPFactory: ${crpFactoryAddress}`);
}

export const basicDeploy = async (name, libs) => {
  const factory = await ethers.getContractFactory(name, {
    libraries: libs,
  });

  const contract = await factory.deploy();

  await contract.deployed();

  return contract;
};

export const balancerDeploy = async (): Promise<
  [RightsManager, CRPFactory, BFactory]
> => {
  let rightsManager: RightsManager;
  if (rightsManagerAddress) {
    rightsManager = new ethers.Contract(
      rightsManagerAddress,
      (await artifacts.readArtifact("RightsManager")).abi
    ) as RightsManager;
  } else {
    rightsManager = (await basicDeploy("RightsManager", {})) as RightsManager;
  }

  let balancerSafeMath;
  if (balancerSafeMathAddress) {
    balancerSafeMath = new ethers.Contract(
      balancerSafeMathAddress,
      (await artifacts.readArtifact("BalancerSafeMath")).abi
    );
  } else {
    balancerSafeMath = await basicDeploy("BalancerSafeMath", {});
  }

  let smartPoolManager: SmartPoolManager;
  if (smartPoolManagerAddress) {
    smartPoolManager = new ethers.Contract(
      smartPoolManagerAddress,
      (await artifacts.readArtifact("SmartPoolManager")).abi
    ) as SmartPoolManager;
  } else {
    smartPoolManager = (await basicDeploy(
      "SmartPoolManager",
      {}
    )) as SmartPoolManager;
  }

  let crpFactory: CRPFactory;
  if (crpFactoryAddress) {
    crpFactory = new ethers.Contract(
      crpFactoryAddress,
      (await artifacts.readArtifact("CRPFactory")).abi
    ) as CRPFactory;
  } else {
    crpFactory = (await basicDeploy("CRPFactory", {
      RightsManager: rightsManager.address,
      BalancerSafeMath: balancerSafeMath.address,
      SmartPoolManager: smartPoolManager.address,
    })) as CRPFactory;
  }

  let bFactory;
  if (bFactoryAddress) {
    bFactory = new ethers.Contract(
      bFactoryAddress,
      (await artifacts.readArtifact("BFactory")).abi
    ) as BFactory;
  } else {
    bFactory = (await basicDeploy("BFactory", {})) as BFactory;
  }

  return [rightsManager, crpFactory, bFactory];
};

export const zeroAddress = ethers.constants.AddressZero;
export const oneAddress = "0x0000000000000000000000000000000000000001";
export const eighteenZeros = "000000000000000000";

export const fourZeros = "0000";
export const sixZeros = "000000";
export const tenZeros = "0000000000";

export const ONE = ethers.BigNumber.from("1" + eighteenZeros);

export const RESERVE_MIN_BALANCE = ethers.BigNumber.from("1" + sixZeros);

export const max_uint256 = ethers.BigNumber.from(
  "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"
);
export const max_uint32 = ethers.BigNumber.from("0xffffffff");

export const estimateReserveDust = (bPoolReserveBalance: BigNumber) => {
  let dust = bPoolReserveBalance.mul(ONE).div(1e7).div(ONE);
  if (dust.lt(RESERVE_MIN_BALANCE)) {
    dust = RESERVE_MIN_BALANCE;
  }
  return dust;
};

export const determineReserveDust = (bPoolDust: BigNumber) => {
  if (bPoolDust.lt(RESERVE_MIN_BALANCE)) {
    bPoolDust = RESERVE_MIN_BALANCE;
  }
  return bPoolDust;
};

export const assertError = async (f: Function, s: string, e: string) => {
  let didError = false;
  try {
    await f();
  } catch (e) {
    assert(e.toString().includes(s), `error string ${e} does not include ${s}`);
    didError = true;
  }
  assert(didError, e);
};

export const crpJson = require("../artifacts/contracts/configurable-rights-pool/contracts/ConfigurableRightsPool.sol/ConfigurableRightsPool.json");
export const bPoolJson = require("../artifacts/contracts/configurable-rights-pool/contracts/test/BPool.sol/BPool.json");

export const poolContracts = async (
  signers: any,
  pool: RedeemableERC20Pool
): Promise<[ConfigurableRightsPool, BPool]> => {
  const crp = new ethers.Contract(
    await pool.crp(),
    crpJson.abi,
    signers[0]
  ) as ConfigurableRightsPool;
  const bPool = new ethers.Contract(
    await crp.bPool(),
    bPoolJson.abi,
    signers[0]
  ) as BPool;
  return [crp, bPool];
};
