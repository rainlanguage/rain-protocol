import { ethers } from "hardhat";
import type { RightsManager } from "../typechain/RightsManager";
import type { CRPFactory } from "../typechain/CRPFactory";
import type { BFactory } from "../typechain/BFactory";
import chai from "chai";
import type { RedeemableERC20Pool } from "../typechain/RedeemableERC20Pool";
import type { ConfigurableRightsPool } from "../typechain/ConfigurableRightsPool";
import type { BPool } from "../typechain/BPool";

const { expect, assert } = chai;

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
  const rightsManager = (await basicDeploy(
    "RightsManager",
    {}
  )) as RightsManager;
  const balancerSafeMath = await basicDeploy("BalancerSafeMath", {});
  const smartPoolManager = await basicDeploy("SmartPoolManager", {});
  const crpFactory = (await basicDeploy("CRPFactory", {
    RightsManager: rightsManager.address,
    BalancerSafeMath: balancerSafeMath.address,
    SmartPoolManager: smartPoolManager.address,
  })) as CRPFactory;
  const bFactory = (await basicDeploy("BFactory", {})) as BFactory;

  return [rightsManager, crpFactory, bFactory];
};

export const zeroAddress = ethers.constants.AddressZero;
export const eighteenZeros = "000000000000000000";

export const fourZeros = "0000"; // poor precision
export const tenZeros = "0000000000"; // just enough precision for dust

export const ONE = ethers.BigNumber.from("1" + eighteenZeros);

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
