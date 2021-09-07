import { ethers } from "hardhat";
import type { RightsManager } from "../typechain/RightsManager";
import type { CRPFactory } from "../typechain/CRPFactory";
import type { BFactory } from "../typechain/BFactory";
import chai from "chai";
import type { TrustFactory } from "../typechain/TrustFactory";
import type { RedeemableERC20Factory } from "../typechain/RedeemableERC20Factory";
import type { RedeemableERC20PoolFactory } from "../typechain/RedeemableERC20PoolFactory";
import type { SeedERC20Factory } from "../typechain/SeedERC20Factory";
import type { RedeemableERC20Pool } from "../typechain/RedeemableERC20Pool";
import type { ConfigurableRightsPool } from "../typechain/ConfigurableRightsPool";
import type { BPool } from "../typechain/BPool";
import type { BigNumber } from "ethers";
import type { Trust } from "../typechain/Trust";

const trustJson = require("../artifacts/contracts/Trust.sol/Trust.json");

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

export interface Factories {
  redeemableERC20Factory: RedeemableERC20Factory;
  redeemableERC20PoolFactory: RedeemableERC20PoolFactory;
  seedERC20Factory: SeedERC20Factory;
  trustFactory: TrustFactory;
}

export const factoriesDeploy = async (
  rightsManager: RightsManager,
  crpFactory: CRPFactory,
  balancerFactory: BFactory
): Promise<Factories> => {
  const redeemableERC20FactoryFactory = await ethers.getContractFactory(
    "RedeemableERC20Factory"
  );
  const redeemableERC20Factory =
    (await redeemableERC20FactoryFactory.deploy()) as RedeemableERC20Factory;
  await redeemableERC20Factory.deployed();

  const redeemableERC20PoolFactoryFactory = await ethers.getContractFactory(
    "RedeemableERC20PoolFactory",
    {
      libraries: {
        RightsManager: rightsManager.address,
      },
    }
  );
  const redeemableERC20PoolFactory =
    (await redeemableERC20PoolFactoryFactory.deploy({
      crpFactory: crpFactory.address,
      balancerFactory: balancerFactory.address,
    })) as RedeemableERC20PoolFactory;
  await redeemableERC20PoolFactory.deployed();

  const seedERC20FactoryFactory = await ethers.getContractFactory(
    "SeedERC20Factory"
  );
  const seedERC20Factory =
    (await seedERC20FactoryFactory.deploy()) as SeedERC20Factory;
  await seedERC20Factory.deployed();

  const trustFactoryFactory = await ethers.getContractFactory("TrustFactory");
  const trustFactory = (await trustFactoryFactory.deploy({
    redeemableERC20Factory: redeemableERC20Factory.address,
    redeemableERC20PoolFactory: redeemableERC20PoolFactory.address,
    seedERC20Factory: seedERC20Factory.address,
  })) as TrustFactory;
  await trustFactory.deployed();

  return {
    redeemableERC20Factory,
    redeemableERC20PoolFactory,
    seedERC20Factory,
    trustFactory,
  };
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

export const trustDeploy = async (
  trustFactory: TrustFactory,
  creator: any,
  ...args
): Promise<Trust> => {
  const tx = await trustFactory[
    "createChild((address,uint256,address,uint256,uint16,uint16,uint256),(string,string,address,uint8,uint256),(address,uint256,uint256,uint256,uint256))"
  ](...args);
  const receipt = await tx.wait();

  const trust = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        receipt.events?.filter(
          (x) => x.event == "NewContract" && x.address == trustFactory.address
        )[0].topics[1]
      ),
      20 // address bytes length
    ),
    trustJson.abi,
    creator
  ) as Trust;

  if (!ethers.utils.isAddress(trust.address)) {
    throw new Error(
      `invalid trust address: ${trust.address} (${trust.address.length} chars)`
    );
  }

  await trust.deployed();

  return trust;
};

/**
 * Utility function that transforms a hexadecimal number from the output of the ITier contract report
 * @param report String with Hexadecimal containing the array data
 * @returns number[] Block array of the reports
 */
export function tierReport(report: string): number[] {
  let parsedReport: number[] = [];
  let arrStatus = [0, 1, 2, 3, 4, 5, 6, 7]
    .map((i) =>
      BigInt(report)
        .toString(16)
        .padStart(64, "0")
        .slice(i * 8, i * 8 + 8)
    )
    .reverse();
  //arrStatus = arrStatus.reverse();

  for (let i in arrStatus) {
    parsedReport.push(parseInt("0x" + arrStatus[i]));
  }

  return parsedReport;
}

export function blockNumbersToReport(blockNos: number[]): string {
  assert(blockNos.length === 8);

  return [...blockNos]
    .reverse()
    .map((i) => BigInt(i).toString(16).padStart(8, "0"))
    .join("");
}
