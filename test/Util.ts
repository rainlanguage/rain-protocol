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
import type { BigNumber, Contract, BytesLike, BigNumberish } from "ethers";
import type { Trust } from "../typechain/Trust";
import type { SmartPoolManager } from "../typechain/SmartPoolManager";
import { concat, Hexable, hexlify, zeroPad } from "ethers/lib/utils";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  [CRPFactory & Contract, BFactory & Contract]
> => {
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

  let smartPoolManager: SmartPoolManager & Contract;
  if (smartPoolManagerAddress) {
    smartPoolManager = new ethers.Contract(
      smartPoolManagerAddress,
      (await artifacts.readArtifact("SmartPoolManager")).abi
    ) as SmartPoolManager & Contract;
  } else {
    smartPoolManager = (await basicDeploy(
      "SmartPoolManager",
      {}
    )) as SmartPoolManager & Contract;
  }

  let crpFactory: CRPFactory & Contract;
  if (crpFactoryAddress) {
    crpFactory = new ethers.Contract(
      crpFactoryAddress,
      (await artifacts.readArtifact("CRPFactory")).abi
    ) as CRPFactory & Contract;
  } else {
    crpFactory = (await basicDeploy("CRPFactory", {
      RightsManager: rightsManager.address,
      BalancerSafeMath: balancerSafeMath.address,
      SmartPoolManager: smartPoolManager.address,
    })) as CRPFactory & Contract;
  }

  let bFactory;
  if (bFactoryAddress) {
    bFactory = new ethers.Contract(
      bFactoryAddress,
      (await artifacts.readArtifact("BFactory")).abi
    ) as BFactory & Contract;
  } else {
    bFactory = (await basicDeploy("BFactory", {})) as BFactory & Contract;
  }

  return [crpFactory, bFactory];
};

export interface Factories {
  redeemableERC20Factory: RedeemableERC20Factory & Contract;
  redeemableERC20PoolFactory: RedeemableERC20PoolFactory & Contract;
  seedERC20Factory: SeedERC20Factory & Contract;
  trustFactory: TrustFactory & Contract;
}

export const factoriesDeploy = async (
  crpFactory: CRPFactory & Contract,
  balancerFactory: BFactory & Contract
): Promise<Factories> => {
  const redeemableERC20FactoryFactory = await ethers.getContractFactory(
    "RedeemableERC20Factory"
  );
  const redeemableERC20Factory =
    (await redeemableERC20FactoryFactory.deploy()) as RedeemableERC20Factory &
      Contract;
  await redeemableERC20Factory.deployed();

  const redeemableERC20PoolFactoryFactory = await ethers.getContractFactory(
    "RedeemableERC20PoolFactory"
  );
  const redeemableERC20PoolFactory =
    (await redeemableERC20PoolFactoryFactory.deploy({
      crpFactory: crpFactory.address,
      balancerFactory: balancerFactory.address,
    })) as RedeemableERC20PoolFactory & Contract;
  await redeemableERC20PoolFactory.deployed();

  const seedERC20FactoryFactory = await ethers.getContractFactory(
    "SeedERC20Factory"
  );
  const seedERC20Factory =
    (await seedERC20FactoryFactory.deploy()) as SeedERC20Factory & Contract;
  await seedERC20Factory.deployed();

  const trustFactoryFactory = await ethers.getContractFactory("TrustFactory");
  const trustFactory = (await trustFactoryFactory.deploy({
    redeemableERC20Factory: redeemableERC20Factory.address,
    redeemableERC20PoolFactory: redeemableERC20PoolFactory.address,
    seedERC20Factory: seedERC20Factory.address,
  })) as TrustFactory & Contract;
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
export const nineZeros = "000000000";
export const tenZeros = "0000000000";

export const ONE = ethers.BigNumber.from("1" + eighteenZeros);

export const RESERVE_MIN_BALANCE = ethers.BigNumber.from("1" + sixZeros);

export const max_uint256 = ethers.BigNumber.from(
  "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"
);
export const max_uint32 = ethers.BigNumber.from("0xffffffff");

export const ALWAYS = 0;
export const NEVER = max_uint256;

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

export const isDustLike = (
  maybeDust: BigNumber,
  minBalance: BigNumber
): boolean => {
  return maybeDust.lte(minBalance) ? true : false;
};

export const assertError = async (f, s: string, e: string) => {
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
  signers: SignerWithAddress[],
  pool: RedeemableERC20Pool & Contract
): Promise<[ConfigurableRightsPool & Contract, BPool & Contract]> => {
  const crp = new ethers.Contract(
    await pool.crp(),
    (await artifacts.readArtifact("ConfigurableRightsPool")).abi,
    signers[0]
  ) as ConfigurableRightsPool & Contract;
  const bPool = new ethers.Contract(
    await crp.bPool(),
    (await artifacts.readArtifact("BPool")).abi,
    signers[0]
  ) as BPool & Contract;
  return [crp, bPool];
};

export const trustDeploy = async (
  trustFactory: TrustFactory & Contract,
  creator: SignerWithAddress,
  ...args
): Promise<Trust & Contract> => {
  const tx = await trustFactory[
    "createChild((address,uint256,address,uint256,uint16,uint16,uint256,(string,string)),((string,string),address,uint8,uint256),(address,uint256,uint256,uint256,uint256))"
  ](
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    ...args
  );
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
  ) as Trust & Contract;

  if (!ethers.utils.isAddress(trust.address)) {
    throw new Error(
      `invalid trust address: ${trust.address} (${trust.address.length} chars)`
    );
  }

  await trust.deployed();

  return trust;
};

export const createEmptyBlock = async (count?: number): Promise<void> => {
  const signers = await ethers.getSigners();
  const tx = { to: signers[1].address };
  if (count > 0) {
    for (let i = 0; i < count; i++) {
      await signers[0].sendTransaction(tx);
    }
  } else {
    await signers[0].sendTransaction(tx);
  }
};

/**
 * Utility function that transforms a hexadecimal number from the output of the ITier contract report
 * @param report String with Hexadecimal containing the array data
 * @returns number[] Block array of the reports
 */
export function tierReport(report: string): number[] {
  const parsedReport: number[] = [];
  const arrStatus = [0, 1, 2, 3, 4, 5, 6, 7]
    .map((i) =>
      BigInt(report)
        .toString(16)
        .padStart(64, "0")
        .slice(i * 8, i * 8 + 8)
    )
    .reverse();
  //arrStatus = arrStatus.reverse();

  for (const i in arrStatus) {
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
 * @param bytesLength - (defaults to 1) number of bytes to left pad if `value` doesn't completely fill the desired amount of memory. Will throw `InvalidArgument` error if value already exceeds bytes length.
 * @returns {Uint8Array} - raw bytes representation
 */
export function bytify(
  value: number | BytesLike | Hexable,
  bytesLength = 1
): BytesLike {
  return zeroPad(hexlify(value), bytesLength);
}

/**
 * Constructs the operand for RainVM's `call` opcode by packing 3 numbers into a single byte. All parameters use zero-based counting i.e. an `fnSize` of 0 means to allocate one element (32 bytes) on the stack to define your functions, while an `fnSize` of 3 means to allocate all four elements (4 * 32 bytes) on the stack.
 *
 * @param fnSize - number of elements on stack to allocate for functions (range 0-3)
 * @param loopSize - number of times to subdivide vals, reduces uint size but allows for more vals (range 0-7)
 * @param valSize - number of vals in outer stack (range 0-7)
 */
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

export function arg(valIndex: number): number {
  let arg = 1;
  arg <<= 7;
  arg += valIndex;
  return arg;
}

/**
 * Converts an opcode and operand to bytes, and returns their concatenation.
 * @param code - the opcode
 * @param erand - the operand, currently limited to 1 byte (defaults to 0)
 */
export function op(code: number, erand = 0): Uint8Array {
  return concat([bytify(erand), bytify(code)]);
}

export const wrap2BitUInt = (integer: number) => {
  while (integer > 3) {
    integer -= 4;
  }
  return integer;
};

export const wrap4BitUInt = (integer: number) => {
  while (integer > 15) {
    integer -= 16;
  }
  return integer;
};

export const wrap8BitUInt = (integer: number) => {
  while (integer > 255) {
    integer -= 256;
  }
  return integer;
};

export const array2BitUInts = (length) =>
  Array(length)
    .fill(0)
    // .map((_, i) => 3);
    .map((_, i) => wrap2BitUInt(i));

export const array4BitUInts = (length) =>
  Array(length)
    .fill(0)
    .map((_, i) => wrap4BitUInt(i));

export const array8BitUInts = (length) =>
  Array(length)
    .fill(0)
    .map((_, i) => wrap8BitUInt(i));

export const pack32UIntsIntoByte = (numArray: number[]): number[] => {
  const val: number[] = [];
  let valIndex = 0;

  for (let i = 0; i < numArray.length; i += 4) {
    const byte =
      (numArray[i] << 6) +
      (numArray[i + 1] << 4) +
      (numArray[i + 2] << 2) +
      numArray[i + 3];

    val[valIndex] = byte;
    valIndex++;
  }

  return val;
};

export const paddedReport = (report: BigNumber): string => {
  return "0x" + report.toHexString().substring(2).padStart(64, "0");
};

export const paddedBlock = (
  blockNumber: number | BytesLike | Hexable
): string => {
  return hexlify(blockNumber).substring(2).padStart(8, "0");
};

export type Source = [BigNumberish, BigNumberish, BigNumberish, BigNumberish];
export type Constants = [
  BigNumberish,
  BigNumberish,
  BigNumberish,
  BigNumberish,
  BigNumberish,
  BigNumberish,
  BigNumberish,
  BigNumberish,
  BigNumberish,
  BigNumberish,
  BigNumberish,
  BigNumberish,
  BigNumberish,
  BigNumberish,
  BigNumberish,
  BigNumberish
];

export function chunkedSource(monolithicSource: Uint8Array): Source {
  const source: Source = [0, 0, 0, 0];

  for (let sourceIndex = 0; sourceIndex < 4; sourceIndex++) {
    const sourceElement: Array<number> = [];

    let i = 0;
    for (i = 0; i < 32 && monolithicSource?.[i + sourceIndex * 32] >= 0; i++) {
      sourceElement[i] = monolithicSource[i + sourceIndex * 32];
    }

    source[sourceIndex] = i === 0 ? 0 : sourceElement;
  }

  return source;
}
