import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import { concat } from "ethers/lib/utils";
import { bytify, op, paddedUInt32, paddedUInt256 } from "../Util";
import type { Contract, ContractFactory } from "ethers";

import type { CombineTier } from "../../typechain/CombineTier";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import type { CombineTierFactory } from "../../typechain/CombineTierFactory";
import type { Source } from "../Util";

chai.use(solidity);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { expect, assert } = chai;

enum Tier {
  ZERO,
  ONE,
  TWO,
  THREE,
  FOUR,
  FIVE,
  SIX,
  SEVEN,
  EIGHT,
}

const enum Opcode {
  END,
  VAL,
  ZIPMAP,
  BLOCK_NUMBER,
  REPORT,
  NEVER,
  ALWAYS,
  DIFF,
  UPDATE_BLOCKS_FOR_TIER_RANGE,
  AND_OLD,
  AND_NEW,
  AND_LEFT,
  OR_OLD,
  OR_NEW,
  OR_LEFT,
  ACCOUNT,
}

const sourceAlways: Source = [concat([op(Opcode.ALWAYS)]), 0, 0, 0];
const sourceNever: Source = [concat([op(Opcode.NEVER)]), 0, 0, 0];

describe("CombineTier", async function () {
  it("should correctly combine Always and Never tier contracts with orLeft", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const combineTierFactory = (await ethers.getContractFactory(
      "CombineTier"
    )) as CombineTierFactory & ContractFactory;

    const alwaysTier = (await combineTierFactory.deploy({
      source: sourceAlways,
      constants: [],
      arguments: [],
    })) as CombineTier & Contract;
    const neverTier = (await combineTierFactory.deploy({
      source: sourceNever,
      constants: [],
      arguments: [],
    })) as CombineTier & Contract;

    const constants = [
      ethers.BigNumber.from(alwaysTier.address), // right report
      ethers.BigNumber.from(neverTier.address), // left report
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ];

    const source = [
      concat([
        op(Opcode.OR_LEFT, 2),
        op(Opcode.REPORT),
        op(Opcode.VAL, 0),
        op(Opcode.ACCOUNT),
        op(Opcode.REPORT),
        op(Opcode.VAL, 1),
        op(Opcode.ACCOUNT),
        op(Opcode.BLOCK_NUMBER),
      ]),
      0,
      0,
      0,
    ];

    const combineTier = (await combineTierFactory.deploy({
      source,
      constants,
      arguments: [],
    })) as CombineTier & Contract;

    const result = await combineTier.report(signers[0].address);

    // for each tier, Always has blocks which are lte current block
    // therefore, OR_LEFT succeeds

    const expected = 0x00; // success, left report's block number for each tier
    assert(
      result.eq(expected),
      `wrong block number preserved with tierwise orLeft
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should correctly combine Always and Never tier contracts with orNew", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const combineTierFactory = (await ethers.getContractFactory(
      "CombineTier"
    )) as CombineTierFactory & ContractFactory;

    const alwaysTier = (await combineTierFactory.deploy({
      source: sourceAlways,
      constants: [],
      arguments: [],
    })) as CombineTier & Contract;
    const neverTier = (await combineTierFactory.deploy({
      source: sourceNever,
      constants: [],
      arguments: [],
    })) as CombineTier & Contract;

    const constants = [
      ethers.BigNumber.from(alwaysTier.address),
      ethers.BigNumber.from(neverTier.address),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ];

    const source = [
      concat([
        op(Opcode.OR_NEW, 2),
        op(Opcode.REPORT),
        op(Opcode.VAL, 0),
        op(Opcode.ACCOUNT),
        op(Opcode.REPORT),
        op(Opcode.VAL, 1),
        op(Opcode.ACCOUNT),
        op(Opcode.BLOCK_NUMBER),
      ]),
      0,
      0,
      0,
    ];

    const combineTier = (await combineTierFactory.deploy({
      source,
      constants,
      arguments: [],
    })) as CombineTier & Contract;

    const result = await combineTier.report(signers[0].address);

    // for each tier, Always has blocks which are lte current block
    // therefore, OR_NEW succeeds

    const expected = 0x00; // success, newest block number before current block for each tier
    assert(
      result.eq(expected),
      `wrong block number preserved with tierwise orNew
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should correctly combine Always and Never tier contracts with orOld", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const combineTierFactory = (await ethers.getContractFactory(
      "CombineTier"
    )) as CombineTierFactory & ContractFactory;

    const alwaysTier = (await combineTierFactory.deploy({
      source: sourceAlways,
      constants: [],
      arguments: [],
    })) as CombineTier & Contract;
    const neverTier = (await combineTierFactory.deploy({
      source: sourceNever,
      constants: [],
      arguments: [],
    })) as CombineTier & Contract;

    const vals = [
      ethers.BigNumber.from(alwaysTier.address),
      ethers.BigNumber.from(neverTier.address),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ];

    const source = [
      concat([
        op(Opcode.OR_OLD, 2),
        op(Opcode.REPORT),
        op(Opcode.VAL, 0),
        op(Opcode.ACCOUNT),
        op(Opcode.REPORT),
        op(Opcode.VAL, 1),
        op(Opcode.ACCOUNT),
        op(Opcode.BLOCK_NUMBER),
      ]),
      0,
      0,
      0,
    ];

    const combineTier = (await combineTierFactory.deploy({
      source,
      constants: vals,
      arguments: [],
    })) as CombineTier & Contract;

    const result = await combineTier.report(signers[0].address);

    // for each tier, Always has blocks which are lte current block
    // therefore, OR_OLD succeeds

    const expected = 0x00; // success, oldest block number for each tier
    assert(
      result.eq(expected),
      `wrong block number preserved with tierwise orOld
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should correctly combine Always and Never tier contracts with andLeft", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const combineTierFactory = (await ethers.getContractFactory(
      "CombineTier"
    )) as CombineTierFactory & ContractFactory;

    const alwaysTier = (await combineTierFactory.deploy({
      source: sourceAlways,
      constants: [],
      arguments: [],
    })) as CombineTier & Contract;
    const neverTier = (await combineTierFactory.deploy({
      source: sourceNever,
      constants: [],
      arguments: [],
    })) as CombineTier & Contract;

    const constants = [
      ethers.BigNumber.from(alwaysTier.address), // right report
      ethers.BigNumber.from(neverTier.address), // left report
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ];

    const source = [
      concat([
        op(Opcode.AND_LEFT, 2),
        op(Opcode.REPORT),
        op(Opcode.VAL, 0),
        op(Opcode.ACCOUNT),
        op(Opcode.REPORT),
        op(Opcode.VAL, 1),
        op(Opcode.ACCOUNT),
        op(Opcode.BLOCK_NUMBER),
      ]),
      0,
      0,
      0,
    ];

    const combineTier = (await combineTierFactory.deploy({
      source,
      constants,
      arguments: [],
    })) as CombineTier & Contract;

    const result = await combineTier.report(signers[0].address);

    // for each tier, only Always has blocks which are lte current block
    // therefore, AND_LEFT fails

    const expected = Util.max_uint256; // 'false'
    assert(
      result.eq(expected),
      `wrong block number preserved with tierwise andLeft
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should correctly combine Always and Never tier contracts with andOld", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const combineTierFactory = (await ethers.getContractFactory(
      "CombineTier"
    )) as CombineTierFactory & ContractFactory;

    const alwaysTier = (await combineTierFactory.deploy({
      source: sourceAlways,
      constants: [],
      arguments: [],
    })) as CombineTier & Contract;
    const neverTier = (await combineTierFactory.deploy({
      source: sourceNever,
      constants: [],
      arguments: [],
    })) as CombineTier & Contract;

    const constants = [
      ethers.BigNumber.from(alwaysTier.address),
      ethers.BigNumber.from(neverTier.address),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ];

    const source = [
      concat([
        op(Opcode.AND_OLD, 2),
        op(Opcode.REPORT),
        op(Opcode.VAL, 0),
        op(Opcode.ACCOUNT),
        op(Opcode.REPORT),
        op(Opcode.VAL, 1),
        op(Opcode.ACCOUNT),
        op(Opcode.BLOCK_NUMBER),
      ]),
      0,
      0,
      0,
    ];

    const combineTier = (await combineTierFactory.deploy({
      source,
      constants,
      arguments: [],
    })) as CombineTier & Contract;

    const result = await combineTier.report(signers[0].address);

    // for each tier, only Always has blocks which are lte current block
    // therefore, AND_OLD fails

    const expected = Util.max_uint256; // 'false'
    assert(
      result.eq(expected),
      `wrong block number preserved with tierwise andOld
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should correctly combine Always and Never tier contracts with andNew", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const combineTierFactory = (await ethers.getContractFactory(
      "CombineTier"
    )) as CombineTierFactory & ContractFactory;

    const alwaysTier = (await combineTierFactory.deploy({
      source: sourceAlways,
      constants: [],
      arguments: [],
    })) as CombineTier & Contract;
    const neverTier = (await combineTierFactory.deploy({
      source: sourceNever,
      constants: [],
      arguments: [],
    })) as CombineTier & Contract;

    const constants = [
      ethers.BigNumber.from(alwaysTier.address),
      ethers.BigNumber.from(neverTier.address),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ];

    const source = [
      concat([
        op(Opcode.AND_NEW, 2),
        op(Opcode.REPORT),
        op(Opcode.VAL, 0),
        op(Opcode.ACCOUNT),
        op(Opcode.REPORT),
        op(Opcode.VAL, 1),
        op(Opcode.ACCOUNT),
        op(Opcode.BLOCK_NUMBER),
      ]),
      0,
      0,
      0,
    ];

    const combineTier = (await combineTierFactory.deploy({
      source,
      constants,
      arguments: [],
    })) as CombineTier & Contract;

    const result = await combineTier.report(signers[0].address);

    // for each tier, only Always has blocks which are lte current block
    // therefore, AND_NEW fails

    const expected = Util.max_uint256; // 'false'
    assert(
      result.eq(expected),
      `wrong block number preserved with tierwise andNew
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should support a program which returns the default report", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const combineTierFactory = (await ethers.getContractFactory(
      "CombineTier"
    )) as CombineTierFactory & ContractFactory;

    const alwaysTier = (await combineTierFactory.deploy({
      source: sourceAlways,
      constants: [],
      arguments: [],
    })) as CombineTier & Contract;
    const neverTier = (await combineTierFactory.deploy({
      source: sourceNever,
      constants: [],
      arguments: [],
    })) as CombineTier & Contract;

    const constants = [
      ethers.BigNumber.from(alwaysTier.address),
      ethers.BigNumber.from(neverTier.address),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ];

    const sourceAlwaysReport = [
      concat([op(Opcode.REPORT, 0), op(Opcode.VAL, 0), op(Opcode.ACCOUNT, 0)]),
      0,
      0,
      0,
    ];

    const sourceNeverReport = [
      concat([op(Opcode.REPORT, 0), op(Opcode.VAL, 1), op(Opcode.ACCOUNT, 0)]),
      0,
      0,
      0,
    ];

    const combineTierAlways = (await combineTierFactory.deploy({
      source: sourceAlwaysReport,
      constants,
      arguments: [],
    })) as CombineTier & Contract;

    const resultAlwaysReport = await combineTierAlways.report(
      signers[1].address
    );

    const expectedAlwaysReport = 0;
    assert(
      resultAlwaysReport.eq(expectedAlwaysReport),
      `wrong report
      expected  ${expectedAlwaysReport}
      got       ${resultAlwaysReport}`
    );

    const combineTierNever = (await combineTierFactory.deploy({
      source: sourceNeverReport,
      constants,
      arguments: [],
    })) as CombineTier & Contract;

    const resultNeverReport = await combineTierNever.report(signers[1].address);

    const expectedNeverReport = ethers.constants.MaxUint256;
    assert(
      resultNeverReport.eq(expectedNeverReport),
      `wrong report
      expected ${expectedNeverReport}
      got      ${resultNeverReport}`
    );
  });

  it("should support a program which simply returns the account", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const source = [concat([bytify(0), bytify(Opcode.ACCOUNT)]), 0, 0, 0];

    const combineTierFactory = (await ethers.getContractFactory(
      "CombineTier"
    )) as CombineTierFactory & ContractFactory;
    const combineTier = (await combineTierFactory.deploy({
      source,
      constants: [],
      arguments: [],
    })) as CombineTier & Contract;

    const result = await combineTier.report(signers[1].address);
    const expected = signers[1].address;
    assert(
      result.eq(expected),
      `wrong account address
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should correctly combine ReadWriteTier tier contracts with andOld", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTierRight =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;
    const readWriteTierLeft =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;

    const constants = [
      ethers.BigNumber.from(readWriteTierRight.address), // right report
      ethers.BigNumber.from(readWriteTierLeft.address), // left report
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ];

    const source = [
      concat([
        op(Opcode.AND_OLD, 2),
        op(Opcode.REPORT),
        op(Opcode.VAL, 0),
        op(Opcode.ACCOUNT),
        op(Opcode.REPORT),
        op(Opcode.VAL, 1),
        op(Opcode.ACCOUNT),
        op(Opcode.BLOCK_NUMBER),
      ]),
      0,
      0,
      0,
    ];

    const combineTierFactory = (await ethers.getContractFactory(
      "CombineTier"
    )) as CombineTierFactory & ContractFactory;
    const combineTier = (await combineTierFactory.deploy({
      source,
      constants,
      arguments: [],
    })) as CombineTier & Contract;

    const startBlock = await ethers.provider.getBlockNumber();

    // Set some tiers
    // ReadWriteTierRight
    await readWriteTierRight.setTier(signers[0].address, Tier.ONE, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.TWO, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.THREE, []);

    // ReadWriteTierLeft
    await readWriteTierLeft.setTier(signers[0].address, Tier.ONE, []);
    await readWriteTierLeft.setTier(signers[0].address, Tier.TWO, []);
    await readWriteTierLeft.setTier(signers[0].address, Tier.THREE, []);

    // ReadWriteTierLeft
    await readWriteTierLeft.setTier(signers[0].address, Tier.FOUR, []);
    await readWriteTierLeft.setTier(signers[0].address, Tier.FIVE, []);
    await readWriteTierLeft.setTier(signers[0].address, Tier.SIX, []);

    // ReadWriteTierRight
    await readWriteTierRight.setTier(signers[0].address, Tier.FOUR, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.FIVE, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.SIX, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.EIGHT, []);

    const rightReport = paddedUInt256(
      await readWriteTierRight.report(signers[0].address)
    );
    const expectedRightReport = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(startBlock + 13) +
          paddedUInt32(startBlock + 13) +
          paddedUInt32(startBlock + 12) +
          paddedUInt32(startBlock + 11) +
          paddedUInt32(startBlock + 10) +
          paddedUInt32(startBlock + 3) +
          paddedUInt32(startBlock + 2) +
          paddedUInt32(startBlock + 1)
      )
    );
    assert(
      rightReport === expectedRightReport,
      `wrong right report
      expected  ${expectedRightReport}
      got       ${rightReport}`
    );

    const leftReport = paddedUInt256(
      await readWriteTierLeft.report(signers[0].address)
    );
    const expectedLeftReport = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          "ffffffff".repeat(2) +
          paddedUInt32(startBlock + 9) +
          paddedUInt32(startBlock + 8) +
          paddedUInt32(startBlock + 7) +
          paddedUInt32(startBlock + 6) +
          paddedUInt32(startBlock + 5) +
          paddedUInt32(startBlock + 4)
      )
    );
    assert(
      leftReport === expectedLeftReport,
      `wrong left report
      expected  ${expectedLeftReport}
      got       ${leftReport}`
    );

    const resultAndOld = paddedUInt256(
      await combineTier.report(signers[0].address)
    );
    const expectedAndOld = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          "ffffffff".repeat(2) +
          paddedUInt32(startBlock + 9) +
          paddedUInt32(startBlock + 8) +
          paddedUInt32(startBlock + 7) +
          paddedUInt32(startBlock + 3) +
          paddedUInt32(startBlock + 2) +
          paddedUInt32(startBlock + 1)
      )
    );
    assert(
      resultAndOld === expectedAndOld,
      `wrong block number preserved with tierwise andOld
      left      ${leftReport}
      right     ${rightReport}
      expected  ${expectedAndOld}
      got       ${resultAndOld}`
    );
  });

  it("should correctly combine ReadWriteTier tier contracts with andNew", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTierRight =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;
    const readWriteTierLeft =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;

    const constants = [
      ethers.BigNumber.from(readWriteTierRight.address), // right report
      ethers.BigNumber.from(readWriteTierLeft.address), // left report
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ];

    const source = [
      concat([
        op(Opcode.AND_NEW, 2),
        op(Opcode.REPORT),
        op(Opcode.VAL, 0),
        op(Opcode.ACCOUNT),
        op(Opcode.REPORT),
        op(Opcode.VAL, 1),
        op(Opcode.ACCOUNT),
        op(Opcode.BLOCK_NUMBER),
      ]),
      0,
      0,
      0,
    ];

    const combineTierFactory = (await ethers.getContractFactory(
      "CombineTier"
    )) as CombineTierFactory & ContractFactory;
    const combineTier = (await combineTierFactory.deploy({
      source,
      constants,
      arguments: [],
    })) as CombineTier & Contract;

    const startBlock = await ethers.provider.getBlockNumber();

    // Set some tiers
    // ReadWriteTierRight
    await readWriteTierRight.setTier(signers[0].address, Tier.ONE, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.TWO, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.THREE, []);

    // ReadWriteTierLeft
    await readWriteTierLeft.setTier(signers[0].address, Tier.ONE, []);
    await readWriteTierLeft.setTier(signers[0].address, Tier.TWO, []);
    await readWriteTierLeft.setTier(signers[0].address, Tier.THREE, []);

    // ReadWriteTierLeft
    await readWriteTierLeft.setTier(signers[0].address, Tier.FOUR, []);
    await readWriteTierLeft.setTier(signers[0].address, Tier.FIVE, []);
    await readWriteTierLeft.setTier(signers[0].address, Tier.SIX, []);

    // ReadWriteTierRight
    await readWriteTierRight.setTier(signers[0].address, Tier.FOUR, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.FIVE, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.SIX, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.EIGHT, []);

    const rightReport = paddedUInt256(
      await readWriteTierRight.report(signers[0].address)
    );
    const expectedRightReport = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(startBlock + 13) +
          paddedUInt32(startBlock + 13) +
          paddedUInt32(startBlock + 12) +
          paddedUInt32(startBlock + 11) +
          paddedUInt32(startBlock + 10) +
          paddedUInt32(startBlock + 3) +
          paddedUInt32(startBlock + 2) +
          paddedUInt32(startBlock + 1)
      )
    );

    assert(
      rightReport === expectedRightReport,
      `wrong right report
      expected  ${expectedRightReport}
      got       ${rightReport}`
    );

    const leftReport = paddedUInt256(
      await readWriteTierLeft.report(signers[0].address)
    );
    const expectedLeftReport = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          "ffffffff".repeat(2) +
          paddedUInt32(startBlock + 9) +
          paddedUInt32(startBlock + 8) +
          paddedUInt32(startBlock + 7) +
          paddedUInt32(startBlock + 6) +
          paddedUInt32(startBlock + 5) +
          paddedUInt32(startBlock + 4)
      )
    );

    assert(
      leftReport === expectedLeftReport,
      `wrong left report
      expected  ${expectedLeftReport}
      got       ${leftReport}`
    );

    const resultAndNew = paddedUInt256(
      await combineTier.report(signers[0].address)
    );
    const expectedAndNew = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          "ffffffff".repeat(2) +
          paddedUInt32(startBlock + 12) +
          paddedUInt32(startBlock + 11) +
          paddedUInt32(startBlock + 10) +
          paddedUInt32(startBlock + 6) +
          paddedUInt32(startBlock + 5) +
          paddedUInt32(startBlock + 4)
      )
    );
    assert(
      resultAndNew === expectedAndNew,
      `wrong block number preserved with tierwise andNew
      left      ${leftReport}
      right     ${rightReport}
      expected  ${expectedAndNew}
      got       ${resultAndNew}`
    );
  });

  it("should correctly combine ReadWriteTier tier contracts with andLeft", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTierRight =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;
    const readWriteTierLeft =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;

    const constants = [
      ethers.BigNumber.from(readWriteTierRight.address), // right report
      ethers.BigNumber.from(readWriteTierLeft.address), // left report
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ];

    const source = [
      concat([
        op(Opcode.AND_LEFT, 2),
        op(Opcode.REPORT),
        op(Opcode.VAL, 0),
        op(Opcode.ACCOUNT),
        op(Opcode.REPORT),
        op(Opcode.VAL, 1),
        op(Opcode.ACCOUNT),
        op(Opcode.BLOCK_NUMBER),
      ]),
      0,
      0,
      0,
    ];

    const combineTierFactory = (await ethers.getContractFactory(
      "CombineTier"
    )) as CombineTierFactory & ContractFactory;
    const combineTier = (await combineTierFactory.deploy({
      source,
      constants,
      arguments: [],
    })) as CombineTier & Contract;

    const startBlock = await ethers.provider.getBlockNumber();

    // Set some tiers
    // ReadWriteTierRight
    await readWriteTierRight.setTier(signers[0].address, Tier.ONE, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.TWO, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.THREE, []);

    // ReadWriteTierLeft
    await readWriteTierLeft.setTier(signers[0].address, Tier.ONE, []);
    await readWriteTierLeft.setTier(signers[0].address, Tier.TWO, []);
    await readWriteTierLeft.setTier(signers[0].address, Tier.THREE, []);

    // ReadWriteTierLeft
    await readWriteTierLeft.setTier(signers[0].address, Tier.FOUR, []);
    await readWriteTierLeft.setTier(signers[0].address, Tier.FIVE, []);
    await readWriteTierLeft.setTier(signers[0].address, Tier.SIX, []);

    // ReadWriteTierRight
    await readWriteTierRight.setTier(signers[0].address, Tier.FOUR, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.FIVE, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.SIX, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.EIGHT, []);

    const rightReport = paddedUInt256(
      await readWriteTierRight.report(signers[0].address)
    );
    const expectedRightReport = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(startBlock + 13) +
          paddedUInt32(startBlock + 13) +
          paddedUInt32(startBlock + 12) +
          paddedUInt32(startBlock + 11) +
          paddedUInt32(startBlock + 10) +
          paddedUInt32(startBlock + 3) +
          paddedUInt32(startBlock + 2) +
          paddedUInt32(startBlock + 1)
      )
    );
    assert(
      rightReport === expectedRightReport,
      `wrong right report
      expected  ${expectedRightReport}
      got       ${rightReport}`
    );

    const leftReport = paddedUInt256(
      await readWriteTierLeft.report(signers[0].address)
    );
    const expectedLeftReport = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          "ffffffff".repeat(2) +
          paddedUInt32(startBlock + 9) +
          paddedUInt32(startBlock + 8) +
          paddedUInt32(startBlock + 7) +
          paddedUInt32(startBlock + 6) +
          paddedUInt32(startBlock + 5) +
          paddedUInt32(startBlock + 4)
      )
    );
    assert(
      leftReport === expectedLeftReport,
      `wrong left report
      expected  ${expectedLeftReport}
      got       ${leftReport}`
    );

    const resultAndLeft = paddedUInt256(
      await combineTier.report(signers[0].address)
    );
    const expectedAndLeft = leftReport;
    assert(
      resultAndLeft === expectedAndLeft,
      `wrong block number preserved with tierwise andLeft
      left      ${leftReport}
      right     ${rightReport}
      expected  ${expectedAndLeft}
      got       ${resultAndLeft}`
    );
  });

  it("should correctly combine ReadWriteTier tier contracts with orOld", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTierRight =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;
    const readWriteTierLeft =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;

    const constants = [
      ethers.BigNumber.from(readWriteTierRight.address), // right report
      ethers.BigNumber.from(readWriteTierLeft.address), // left report
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ];

    const source = [
      concat([
        op(Opcode.OR_OLD, 2),
        op(Opcode.REPORT),
        op(Opcode.VAL, 0),
        op(Opcode.ACCOUNT),
        op(Opcode.REPORT),
        op(Opcode.VAL, 1),
        op(Opcode.ACCOUNT),
        op(Opcode.BLOCK_NUMBER),
      ]),
      0,
      0,
      0,
    ];

    const combineTierFactory = (await ethers.getContractFactory(
      "CombineTier"
    )) as CombineTierFactory & ContractFactory;
    const combineTier = (await combineTierFactory.deploy({
      source,
      constants,
      arguments: [],
    })) as CombineTier & Contract;

    const startBlock = await ethers.provider.getBlockNumber();

    // Set some tiers
    // ReadWriteTierRight
    await readWriteTierRight.setTier(signers[0].address, Tier.ONE, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.TWO, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.THREE, []);

    // ReadWriteTierLeft
    await readWriteTierLeft.setTier(signers[0].address, Tier.ONE, []);
    await readWriteTierLeft.setTier(signers[0].address, Tier.TWO, []);
    await readWriteTierLeft.setTier(signers[0].address, Tier.THREE, []);

    // ReadWriteTierLeft
    await readWriteTierLeft.setTier(signers[0].address, Tier.FOUR, []);
    await readWriteTierLeft.setTier(signers[0].address, Tier.FIVE, []);
    await readWriteTierLeft.setTier(signers[0].address, Tier.SIX, []);

    // ReadWriteTierRight
    await readWriteTierRight.setTier(signers[0].address, Tier.FOUR, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.FIVE, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.SIX, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.EIGHT, []);

    const rightReport = paddedUInt256(
      await readWriteTierRight.report(signers[0].address)
    );
    const expectedRightReport = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(startBlock + 13) +
          paddedUInt32(startBlock + 13) +
          paddedUInt32(startBlock + 12) +
          paddedUInt32(startBlock + 11) +
          paddedUInt32(startBlock + 10) +
          paddedUInt32(startBlock + 3) +
          paddedUInt32(startBlock + 2) +
          paddedUInt32(startBlock + 1)
      )
    );
    assert(
      rightReport === expectedRightReport,
      `wrong right report
      expected  ${expectedRightReport}
      got       ${rightReport}`
    );

    const leftReport = paddedUInt256(
      await readWriteTierLeft.report(signers[0].address)
    );
    const expectedLeftReport = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          "ffffffff".repeat(2) +
          paddedUInt32(startBlock + 9) +
          paddedUInt32(startBlock + 8) +
          paddedUInt32(startBlock + 7) +
          paddedUInt32(startBlock + 6) +
          paddedUInt32(startBlock + 5) +
          paddedUInt32(startBlock + 4)
      )
    );
    assert(
      leftReport === expectedLeftReport,
      `wrong left report
      expected  ${expectedLeftReport}
      got       ${leftReport}`
    );

    const resultOrOld = paddedUInt256(
      await combineTier.report(signers[0].address)
    );
    const expectedOrOld = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(startBlock + 13) +
          paddedUInt32(startBlock + 13) +
          paddedUInt32(startBlock + 9) +
          paddedUInt32(startBlock + 8) +
          paddedUInt32(startBlock + 7) +
          paddedUInt32(startBlock + 3) +
          paddedUInt32(startBlock + 2) +
          paddedUInt32(startBlock + 1)
      )
    );
    assert(
      resultOrOld === expectedOrOld,
      `wrong block number preserved with tierwise orOld
      left      ${leftReport}
      right     ${rightReport}
      expected  ${expectedOrOld}
      got       ${resultOrOld}`
    );
  });

  it("should correctly combine ReadWriteTier tier contracts with orNew", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTierRight =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;
    const readWriteTierLeft =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;

    const constants = [
      ethers.BigNumber.from(readWriteTierRight.address), // right report
      ethers.BigNumber.from(readWriteTierLeft.address), // left report
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ];

    const source = [
      concat([
        op(Opcode.OR_NEW, 2),
        op(Opcode.REPORT),
        op(Opcode.VAL, 0),
        op(Opcode.ACCOUNT),
        op(Opcode.REPORT),
        op(Opcode.VAL, 1),
        op(Opcode.ACCOUNT),
        op(Opcode.BLOCK_NUMBER),
      ]),
      0,
      0,
      0,
    ];

    const combineTierFactory = (await ethers.getContractFactory(
      "CombineTier"
    )) as CombineTierFactory & ContractFactory;
    const combineTier = (await combineTierFactory.deploy({
      source,
      constants,
      arguments: [],
    })) as CombineTier & Contract;

    const startBlock = await ethers.provider.getBlockNumber();

    // Set some tiers
    // ReadWriteTierRight
    await readWriteTierRight.setTier(signers[0].address, Tier.ONE, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.TWO, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.THREE, []);

    // ReadWriteTierLeft
    await readWriteTierLeft.setTier(signers[0].address, Tier.ONE, []);
    await readWriteTierLeft.setTier(signers[0].address, Tier.TWO, []);
    await readWriteTierLeft.setTier(signers[0].address, Tier.THREE, []);

    // ReadWriteTierLeft
    await readWriteTierLeft.setTier(signers[0].address, Tier.FOUR, []);
    await readWriteTierLeft.setTier(signers[0].address, Tier.FIVE, []);
    await readWriteTierLeft.setTier(signers[0].address, Tier.SIX, []);

    // ReadWriteTierRight
    await readWriteTierRight.setTier(signers[0].address, Tier.FOUR, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.FIVE, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.SIX, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.EIGHT, []);

    const rightReport = paddedUInt256(
      await readWriteTierRight.report(signers[0].address)
    );
    const expectedRightReport = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(startBlock + 13) +
          paddedUInt32(startBlock + 13) +
          paddedUInt32(startBlock + 12) +
          paddedUInt32(startBlock + 11) +
          paddedUInt32(startBlock + 10) +
          paddedUInt32(startBlock + 3) +
          paddedUInt32(startBlock + 2) +
          paddedUInt32(startBlock + 1)
      )
    );
    assert(
      rightReport === expectedRightReport,
      `wrong right report
      expected  ${expectedRightReport}
      got       ${rightReport}`
    );

    const leftReport = paddedUInt256(
      await readWriteTierLeft.report(signers[0].address)
    );
    const expectedLeftReport = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          "ffffffff".repeat(2) +
          paddedUInt32(startBlock + 9) +
          paddedUInt32(startBlock + 8) +
          paddedUInt32(startBlock + 7) +
          paddedUInt32(startBlock + 6) +
          paddedUInt32(startBlock + 5) +
          paddedUInt32(startBlock + 4)
      )
    );
    assert(
      leftReport === expectedLeftReport,
      `wrong left report
      expected  ${expectedLeftReport}
      got       ${leftReport}`
    );

    const resultOrNew = paddedUInt256(
      await combineTier.report(signers[0].address)
    );
    const expectedOrNew = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(startBlock + 13) +
          paddedUInt32(startBlock + 13) +
          paddedUInt32(startBlock + 12) +
          paddedUInt32(startBlock + 11) +
          paddedUInt32(startBlock + 10) +
          paddedUInt32(startBlock + 6) +
          paddedUInt32(startBlock + 5) +
          paddedUInt32(startBlock + 4)
      )
    );
    assert(
      resultOrNew === expectedOrNew,
      `wrong block number preserved with tierwise orNew
      left      ${leftReport}
      right     ${rightReport}
      expected  ${expectedOrNew}
      got       ${resultOrNew}`
    );
  });

  it("should correctly combine ReadWriteTier tier contracts with orLeft", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTierRight =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;
    const readWriteTierLeft =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;

    const constants = [
      ethers.BigNumber.from(readWriteTierRight.address), // right report
      ethers.BigNumber.from(readWriteTierLeft.address), // left report
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ];

    const source = [
      concat([
        op(Opcode.OR_LEFT, 2),
        op(Opcode.REPORT),
        op(Opcode.VAL, 0),
        op(Opcode.ACCOUNT),
        op(Opcode.REPORT),
        op(Opcode.VAL, 1),
        op(Opcode.ACCOUNT),
        op(Opcode.BLOCK_NUMBER),
      ]),
      0,
      0,
      0,
    ];

    const combineTierFactory = (await ethers.getContractFactory(
      "CombineTier"
    )) as CombineTierFactory & ContractFactory;
    const combineTier = (await combineTierFactory.deploy({
      source,
      constants,
      arguments: [],
    })) as CombineTier & Contract;

    const startBlock = await ethers.provider.getBlockNumber();

    // Set some tiers
    // ReadWriteTierRight
    await readWriteTierRight.setTier(signers[0].address, Tier.ONE, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.TWO, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.THREE, []);

    // ReadWriteTierLeft
    await readWriteTierLeft.setTier(signers[0].address, Tier.ONE, []);
    await readWriteTierLeft.setTier(signers[0].address, Tier.TWO, []);
    await readWriteTierLeft.setTier(signers[0].address, Tier.THREE, []);

    // ReadWriteTierLeft
    await readWriteTierLeft.setTier(signers[0].address, Tier.FOUR, []);
    await readWriteTierLeft.setTier(signers[0].address, Tier.FIVE, []);
    await readWriteTierLeft.setTier(signers[0].address, Tier.SIX, []);

    // ReadWriteTierRight
    await readWriteTierRight.setTier(signers[0].address, Tier.FOUR, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.FIVE, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.SIX, []);
    await readWriteTierRight.setTier(signers[0].address, Tier.EIGHT, []);

    const rightReport = paddedUInt256(
      await readWriteTierRight.report(signers[0].address)
    );
    const expectedRightReport = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(startBlock + 13) +
          paddedUInt32(startBlock + 13) +
          paddedUInt32(startBlock + 12) +
          paddedUInt32(startBlock + 11) +
          paddedUInt32(startBlock + 10) +
          paddedUInt32(startBlock + 3) +
          paddedUInt32(startBlock + 2) +
          paddedUInt32(startBlock + 1)
      )
    );
    assert(
      rightReport === expectedRightReport,
      `wrong right report
      expected  ${expectedRightReport}
      got       ${rightReport}`
    );

    const leftReport = paddedUInt256(
      await readWriteTierLeft.report(signers[0].address)
    );
    const expectedLeftReport = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          "ffffffff".repeat(2) +
          paddedUInt32(startBlock + 9) +
          paddedUInt32(startBlock + 8) +
          paddedUInt32(startBlock + 7) +
          paddedUInt32(startBlock + 6) +
          paddedUInt32(startBlock + 5) +
          paddedUInt32(startBlock + 4)
      )
    );
    assert(
      leftReport === expectedLeftReport,
      `wrong left report
      expected  ${expectedLeftReport}
      got       ${leftReport}`
    );

    const resultOrLeft = paddedUInt256(
      await combineTier.report(signers[0].address)
    );
    const expectedOrLeft = paddedUInt256(
      ethers.BigNumber.from(
        "0x" +
          paddedUInt32(startBlock + 13) +
          paddedUInt32(startBlock + 13) +
          paddedUInt32(startBlock + 9) +
          paddedUInt32(startBlock + 8) +
          paddedUInt32(startBlock + 7) +
          paddedUInt32(startBlock + 6) +
          paddedUInt32(startBlock + 5) +
          paddedUInt32(startBlock + 4)
      )
    );
    assert(
      resultOrLeft === expectedOrLeft,
      `wrong block number preserved with tierwise orLeft
      left      ${leftReport}
      right     ${rightReport}
      expected  ${expectedOrLeft}
      got       ${resultOrLeft}`
    );
  });
});
