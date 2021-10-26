import { ethers, artifacts } from "hardhat";
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
import type { BigNumber, BytesLike } from "ethers";
import type { Trust } from "../typechain/Trust";
import type { SmartPoolManager } from "../typechain/SmartPoolManager";
import { Hexable, hexlify, hexValue, zeroPad } from "ethers/lib/utils";

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

export const balancerDeploy = async (): Promise<[CRPFactory, BFactory]> => {
  let rightsManager;
  if (rightsManagerAddress) {
    rightsManager = new ethers.Contract(
      rightsManagerAddress,
      (await artifacts.readArtifact("RightsManager")).abi
    );
  } else {
    rightsManager = await basicDeploy("RightsManager", {});
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
      (
        await artifacts.readArtifact(
          "@beehiveinnovation/balancer-core/contracts/BFactory.sol:BFactory"
        )
      ).abi
    ) as BFactory;
  } else {
    bFactory = (await basicDeploy(
      "@beehiveinnovation/balancer-core/contracts/BFactory.sol:BFactory",
      {}
    )) as BFactory;
  }

  return [crpFactory, bFactory];
};

export interface Factories {
  redeemableERC20Factory: RedeemableERC20Factory;
  redeemableERC20PoolFactory: RedeemableERC20PoolFactory;
  seedERC20Factory: SeedERC20Factory;
  trustFactory: TrustFactory;
}

export const factoriesDeploy = async (
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
    "RedeemableERC20PoolFactory"
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

export const poolContracts = async (
  signers: any,
  pool: RedeemableERC20Pool
): Promise<[ConfigurableRightsPool, BPool]> => {
  const crp = new ethers.Contract(
    await pool.crp(),
    (await artifacts.readArtifact("ConfigurableRightsPool")).abi,
    signers[0]
  ) as ConfigurableRightsPool;
  const bPool = new ethers.Contract(
    await crp.bPool(),
    (
      await artifacts.readArtifact(
        "@beehiveinnovation/balancer-core/contracts/BPool.sol:BPool"
      )
    ).abi,
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
    (await artifacts.readArtifact("Trust")).abi,
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

export const createEmptyBlock = async (count?: number): Promise<void> => {
  if (!count) count = 1;
  const signers = await ethers.getSigners();
  const txNoOp = { to: signers[1].address };
  for (let i = 0; i < count; i++) {
    await signers[0].sendTransaction(txNoOp);
  }
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

/**
 * Pads leading zeroes of hex number to hex string length of 32 bytes
 * @param {BigNumber} hex
 */
export function zeroPad32(hex: BigNumber): string {
  return ethers.utils.hexZeroPad(hex.toHexString(), 32);
}

/**
 * Pads leading zeroes of hex number to hex string length of 4 bytes
 * @param {BigNumber} hex
 */
export function zeroPad4(hex: BigNumber): string {
  return ethers.utils.hexZeroPad(hex.toHexString(), 4);
}

/**
 * Converts a value to raw bytes representation. Assumes `value` is less than or equal to 1 byte, unless a desired `bytesLength` is specified.
 *
 * @param value - value to convert to raw bytes format
 * @param bytesLength - (default = 1 byte) number of bytes to left pad if `value` doesn't completely fill the desired amount of memory. Will throw `InvalidArgument` error if value already exceeds bytes length.
 * @returns {Uint8Array} - raw bytes representation
 */
export function bytify(
  value: number | BytesLike | Hexable,
  bytesLength: number = 1
): BytesLike {
  return zeroPad(hexlify(value), bytesLength);
}

export function callSize(
  fnSize: number,
  loopSize: number,
  valSize: number
): number {
  // CallSize(
  //   op_.val & 0x03, //     00000011
  //   op_.val & 0x1C, //     00011100
  //   op_.val & 0xE0  //     11100000
  // )

  if (fnSize < 0 || fnSize > 3) {
    throw new Error("Invalid fnSize");
  } else if (loopSize < 0 || loopSize > 7) {
    throw new Error("Invalid loopSize");
  } else if (valSize < 0 || valSize > 7) {
    throw new Error("Invalid valSize");
  }
  let callSize = valSize;
  callSize <<= 3;
  callSize += loopSize;
  callSize <<= 2;
  callSize += fnSize;
  return callSize;
}
