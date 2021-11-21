import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import { concat, hexlify } from "ethers/lib/utils";
import { bytify, op, paddedBlock, paddedReport } from "../Util";
import type { Contract } from "ethers";

import type { CombineTier } from "../../typechain/CombineTier";
import type { AlwaysTier } from "../../typechain/AlwaysTier";
import type { NeverTier } from "../../typechain/NeverTier";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";

chai.use(solidity);
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
  CALL,
  BLOCK_NUMBER,
  ACCOUNT,
  REPORT,
  AND_OLD,
  AND_NEW,
  AND_LEFT,
  OR_OLD,
  OR_NEW,
  OR_LEFT,
}

describe("CombineTier", async function () {
  it("should correctly combine AlwaysTier and NeverTier reports with orLeft", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alwaysTierFactory = await ethers.getContractFactory("AlwaysTier");
    const alwaysTier = (await alwaysTierFactory.deploy()) as AlwaysTier &
      Contract;

    const neverTierFactory = await ethers.getContractFactory("NeverTier");
    const neverTier = (await neverTierFactory.deploy()) as NeverTier & Contract;

    const vals = [
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

    const combineTierFactory = await ethers.getContractFactory("CombineTier");
    const combineTier = (await combineTierFactory.deploy({
      source,
      vals,
    })) as CombineTier & Contract;

    const result = await combineTier.report(signers[0].address);

    // for each tier, AlwaysTier has blocks which are lte current block
    // therefore, OR_LEFT succeeds

    const expected = 0x00; // success, left report's block number for each tier
    assert(
      result.eq(expected),
      `wrong block number preserved with tierwise orLeft
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should correctly combine AlwaysTier and NeverTier reports with orNew", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alwaysTierFactory = await ethers.getContractFactory("AlwaysTier");
    const alwaysTier = (await alwaysTierFactory.deploy()) as AlwaysTier &
      Contract;

    const neverTierFactory = await ethers.getContractFactory("NeverTier");
    const neverTier = (await neverTierFactory.deploy()) as NeverTier & Contract;

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

    const combineTierFactory = await ethers.getContractFactory("CombineTier");
    const combineTier = (await combineTierFactory.deploy({
      source,
      vals,
    })) as CombineTier & Contract;

    const result = await combineTier.report(signers[0].address);

    // for each tier, AlwaysTier has blocks which are lte current block
    // therefore, OR_NEW succeeds

    const expected = 0x00; // success, newest block number before current block for each tier
    assert(
      result.eq(expected),
      `wrong block number preserved with tierwise orNew
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should correctly combine AlwaysTier and NeverTier reports with orOld", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alwaysTierFactory = await ethers.getContractFactory("AlwaysTier");
    const alwaysTier = (await alwaysTierFactory.deploy()) as AlwaysTier &
      Contract;

    const neverTierFactory = await ethers.getContractFactory("NeverTier");
    const neverTier = (await neverTierFactory.deploy()) as NeverTier & Contract;

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

    const combineTierFactory = await ethers.getContractFactory("CombineTier");
    const combineTier = (await combineTierFactory.deploy({
      source,
      vals,
    })) as CombineTier & Contract;

    const result = await combineTier.report(signers[0].address);

    // for each tier, AlwaysTier has blocks which are lte current block
    // therefore, OR_OLD succeeds

    const expected = 0x00; // success, oldest block number for each tier
    assert(
      result.eq(expected),
      `wrong block number preserved with tierwise orOld
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should correctly combine AlwaysTier and NeverTier reports with andLeft", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alwaysTierFactory = await ethers.getContractFactory("AlwaysTier");
    const alwaysTier = (await alwaysTierFactory.deploy()) as AlwaysTier &
      Contract;

    const neverTierFactory = await ethers.getContractFactory("NeverTier");
    const neverTier = (await neverTierFactory.deploy()) as NeverTier & Contract;

    const vals = [
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

    const combineTierFactory = await ethers.getContractFactory("CombineTier");
    const combineTier = (await combineTierFactory.deploy({
      source,
      vals,
    })) as CombineTier & Contract;

    const result = await combineTier.report(signers[0].address);

    // for each tier, only AlwaysTier has blocks which are lte current block
    // therefore, AND_LEFT fails

    const expected = Util.max_uint256; // 'false'
    assert(
      result.eq(expected),
      `wrong block number preserved with tierwise andLeft
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should correctly combine AlwaysTier and NeverTier reports with andOld", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alwaysTierFactory = await ethers.getContractFactory("AlwaysTier");
    const alwaysTier = (await alwaysTierFactory.deploy()) as AlwaysTier &
      Contract;

    const neverTierFactory = await ethers.getContractFactory("NeverTier");
    const neverTier = (await neverTierFactory.deploy()) as NeverTier & Contract;

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

    const combineTierFactory = await ethers.getContractFactory("CombineTier");
    const combineTier = (await combineTierFactory.deploy({
      source,
      vals,
    })) as CombineTier & Contract;

    const result = await combineTier.report(signers[0].address);

    // for each tier, only AlwaysTier has blocks which are lte current block
    // therefore, AND_OLD fails

    const expected = Util.max_uint256; // 'false'
    assert(
      result.eq(expected),
      `wrong block number preserved with tierwise andOld
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should correctly combine AlwaysTier and NeverTier reports with andNew", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alwaysTierFactory = await ethers.getContractFactory("AlwaysTier");
    const alwaysTier = (await alwaysTierFactory.deploy()) as AlwaysTier &
      Contract;

    const neverTierFactory = await ethers.getContractFactory("NeverTier");
    const neverTier = (await neverTierFactory.deploy()) as NeverTier & Contract;

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

    const combineTierFactory = await ethers.getContractFactory("CombineTier");
    const combineTier = (await combineTierFactory.deploy({
      source,
      vals,
    })) as CombineTier & Contract;

    const result = await combineTier.report(signers[0].address);

    // for each tier, only AlwaysTier has blocks which are lte current block
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

    const alwaysTierFactory = await ethers.getContractFactory("AlwaysTier");
    const alwaysTier = (await alwaysTierFactory.deploy()) as AlwaysTier &
      Contract;

    const neverTierFactory = await ethers.getContractFactory("NeverTier");
    const neverTier = (await neverTierFactory.deploy()) as NeverTier & Contract;

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

    const sourceAlways = [
      concat([op(Opcode.REPORT, 0), op(Opcode.VAL, 0), op(Opcode.ACCOUNT, 0)]),
      0,
      0,
      0,
    ];

    const sourceNever = [
      concat([op(Opcode.REPORT, 0), op(Opcode.VAL, 1), op(Opcode.ACCOUNT, 0)]),
      0,
      0,
      0,
    ];

    const combineTierFactory = await ethers.getContractFactory("CombineTier");
    const combineTierAlways = (await combineTierFactory.deploy({
      source: sourceAlways,
      vals,
    })) as CombineTier & Contract;

    const resultAlways = await combineTierAlways.report(signers[1].address);

    const expectedAlways = 0;
    assert(
      resultAlways.eq(expectedAlways),
      `wrong report
      expected  ${expectedAlways}
      got       ${resultAlways}`
    );

    const combineTierNever = (await combineTierFactory.deploy({
      source: sourceNever,
      vals,
    })) as CombineTier & Contract;

    const resultNever = await combineTierNever.report(signers[1].address);

    const expectedNever = ethers.constants.MaxUint256;
    assert(
      resultNever.eq(expectedNever),
      `wrong report
      expected ${expectedNever}
      got      ${resultNever}`
    );
  });

  it("should support a program which simply returns the account", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const vals = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    const source = [concat([bytify(0), bytify(Opcode.ACCOUNT)]), 0, 0, 0];

    const combineTierFactory = await ethers.getContractFactory("CombineTier");
    const combineTier = (await combineTierFactory.deploy({
      source,
      vals,
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

  it("should correctly combine ReadWriteTier reports with andOld", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTierRight =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;
    const readWriteTierLeft =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;

    const vals = [
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

    const combineTierFactory = await ethers.getContractFactory("CombineTier");
    const combineTier = (await combineTierFactory.deploy({
      source,
      vals,
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

    const rightReport = paddedReport(
      await readWriteTierRight.report(signers[0].address)
    );
    const expectedRightReport = paddedReport(
      ethers.BigNumber.from(
        "0x" +
          paddedBlock(startBlock + 13) +
          paddedBlock(startBlock + 13) +
          paddedBlock(startBlock + 12) +
          paddedBlock(startBlock + 11) +
          paddedBlock(startBlock + 10) +
          paddedBlock(startBlock + 3) +
          paddedBlock(startBlock + 2) +
          paddedBlock(startBlock + 1)
      )
    );
    assert(
      rightReport === expectedRightReport,
      `wrong right report
      expected  ${expectedRightReport}
      got       ${rightReport}`
    );

    const leftReport = paddedReport(
      await readWriteTierLeft.report(signers[0].address)
    );
    const expectedLeftReport = paddedReport(
      ethers.BigNumber.from(
        "0x" +
          "ffffffff".repeat(2) +
          paddedBlock(startBlock + 9) +
          paddedBlock(startBlock + 8) +
          paddedBlock(startBlock + 7) +
          paddedBlock(startBlock + 6) +
          paddedBlock(startBlock + 5) +
          paddedBlock(startBlock + 4)
      )
    );
    assert(
      leftReport === expectedLeftReport,
      `wrong left report
      expected  ${expectedLeftReport}
      got       ${leftReport}`
    );

    const resultAndOld = paddedReport(
      await combineTier.report(signers[0].address)
    );
    const expectedAndOld = paddedReport(
      ethers.BigNumber.from(
        "0x" +
          "ffffffff".repeat(2) +
          paddedBlock(startBlock + 9) +
          paddedBlock(startBlock + 8) +
          paddedBlock(startBlock + 7) +
          paddedBlock(startBlock + 3) +
          paddedBlock(startBlock + 2) +
          paddedBlock(startBlock + 1)
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

  it("should correctly combine ReadWriteTier reports with andNew", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTierRight =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;
    const readWriteTierLeft =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;

    const vals = [
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

    const combineTierFactory = await ethers.getContractFactory("CombineTier");
    const combineTier = (await combineTierFactory.deploy({
      source,
      vals,
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

    const rightReport = paddedReport(
      await readWriteTierRight.report(signers[0].address)
    );
    const expectedRightReport = paddedReport(
      ethers.BigNumber.from(
        "0x" +
          paddedBlock(startBlock + 13) +
          paddedBlock(startBlock + 13) +
          paddedBlock(startBlock + 12) +
          paddedBlock(startBlock + 11) +
          paddedBlock(startBlock + 10) +
          paddedBlock(startBlock + 3) +
          paddedBlock(startBlock + 2) +
          paddedBlock(startBlock + 1)
      )
    );

    assert(
      rightReport === expectedRightReport,
      `wrong right report
      expected  ${expectedRightReport}
      got       ${rightReport}`
    );

    const leftReport = paddedReport(
      await readWriteTierLeft.report(signers[0].address)
    );
    const expectedLeftReport = paddedReport(
      ethers.BigNumber.from(
        "0x" +
          "ffffffff".repeat(2) +
          paddedBlock(startBlock + 9) +
          paddedBlock(startBlock + 8) +
          paddedBlock(startBlock + 7) +
          paddedBlock(startBlock + 6) +
          paddedBlock(startBlock + 5) +
          paddedBlock(startBlock + 4)
      )
    );

    assert(
      leftReport === expectedLeftReport,
      `wrong left report
      expected  ${expectedLeftReport}
      got       ${leftReport}`
    );

    const resultAndNew = paddedReport(
      await combineTier.report(signers[0].address)
    );
    const expectedAndNew = paddedReport(
      ethers.BigNumber.from(
        "0x" +
          "ffffffff".repeat(2) +
          paddedBlock(startBlock + 12) +
          paddedBlock(startBlock + 11) +
          paddedBlock(startBlock + 10) +
          paddedBlock(startBlock + 6) +
          paddedBlock(startBlock + 5) +
          paddedBlock(startBlock + 4)
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

  it("should correctly combine ReadWriteTier reports with andLeft", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTierRight =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;
    const readWriteTierLeft =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;

    const vals = [
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

    const combineTierFactory = await ethers.getContractFactory("CombineTier");
    const combineTier = (await combineTierFactory.deploy({
      source,
      vals,
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

    const rightReport = paddedReport(
      await readWriteTierRight.report(signers[0].address)
    );
    const expectedRightReport = paddedReport(
      ethers.BigNumber.from(
        "0x" +
          paddedBlock(startBlock + 13) +
          paddedBlock(startBlock + 13) +
          paddedBlock(startBlock + 12) +
          paddedBlock(startBlock + 11) +
          paddedBlock(startBlock + 10) +
          paddedBlock(startBlock + 3) +
          paddedBlock(startBlock + 2) +
          paddedBlock(startBlock + 1)
      )
    );
    assert(
      rightReport === expectedRightReport,
      `wrong right report
      expected  ${expectedRightReport}
      got       ${rightReport}`
    );

    const leftReport = paddedReport(
      await readWriteTierLeft.report(signers[0].address)
    );
    const expectedLeftReport = paddedReport(
      ethers.BigNumber.from(
        "0x" +
          "ffffffff".repeat(2) +
          paddedBlock(startBlock + 9) +
          paddedBlock(startBlock + 8) +
          paddedBlock(startBlock + 7) +
          paddedBlock(startBlock + 6) +
          paddedBlock(startBlock + 5) +
          paddedBlock(startBlock + 4)
      )
    );
    assert(
      leftReport === expectedLeftReport,
      `wrong left report
      expected  ${expectedLeftReport}
      got       ${leftReport}`
    );

    const resultAndLeft = paddedReport(
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

  it("should correctly combine ReadWriteTier reports with orOld", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTierRight =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;
    const readWriteTierLeft =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;

    const vals = [
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

    const combineTierFactory = await ethers.getContractFactory("CombineTier");
    const combineTier = (await combineTierFactory.deploy({
      source,
      vals,
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

    const rightReport = paddedReport(
      await readWriteTierRight.report(signers[0].address)
    );
    const expectedRightReport = paddedReport(
      ethers.BigNumber.from(
        "0x" +
          paddedBlock(startBlock + 13) +
          paddedBlock(startBlock + 13) +
          paddedBlock(startBlock + 12) +
          paddedBlock(startBlock + 11) +
          paddedBlock(startBlock + 10) +
          paddedBlock(startBlock + 3) +
          paddedBlock(startBlock + 2) +
          paddedBlock(startBlock + 1)
      )
    );
    assert(
      rightReport === expectedRightReport,
      `wrong right report
      expected  ${expectedRightReport}
      got       ${rightReport}`
    );

    const leftReport = paddedReport(
      await readWriteTierLeft.report(signers[0].address)
    );
    const expectedLeftReport = paddedReport(
      ethers.BigNumber.from(
        "0x" +
          "ffffffff".repeat(2) +
          paddedBlock(startBlock + 9) +
          paddedBlock(startBlock + 8) +
          paddedBlock(startBlock + 7) +
          paddedBlock(startBlock + 6) +
          paddedBlock(startBlock + 5) +
          paddedBlock(startBlock + 4)
      )
    );
    assert(
      leftReport === expectedLeftReport,
      `wrong left report
      expected  ${expectedLeftReport}
      got       ${leftReport}`
    );

    const resultOrOld = paddedReport(
      await combineTier.report(signers[0].address)
    );
    const expectedOrOld = paddedReport(
      ethers.BigNumber.from(
        "0x" +
          paddedBlock(startBlock + 13) +
          paddedBlock(startBlock + 13) +
          paddedBlock(startBlock + 9) +
          paddedBlock(startBlock + 8) +
          paddedBlock(startBlock + 7) +
          paddedBlock(startBlock + 3) +
          paddedBlock(startBlock + 2) +
          paddedBlock(startBlock + 1)
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

  it("should correctly combine ReadWriteTier reports with orNew", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTierRight =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;
    const readWriteTierLeft =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;

    const vals = [
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

    const combineTierFactory = await ethers.getContractFactory("CombineTier");
    const combineTier = (await combineTierFactory.deploy({
      source,
      vals,
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

    const rightReport = paddedReport(
      await readWriteTierRight.report(signers[0].address)
    );
    const expectedRightReport = paddedReport(
      ethers.BigNumber.from(
        "0x" +
          paddedBlock(startBlock + 13) +
          paddedBlock(startBlock + 13) +
          paddedBlock(startBlock + 12) +
          paddedBlock(startBlock + 11) +
          paddedBlock(startBlock + 10) +
          paddedBlock(startBlock + 3) +
          paddedBlock(startBlock + 2) +
          paddedBlock(startBlock + 1)
      )
    );
    assert(
      rightReport === expectedRightReport,
      `wrong right report
      expected  ${expectedRightReport}
      got       ${rightReport}`
    );

    const leftReport = paddedReport(
      await readWriteTierLeft.report(signers[0].address)
    );
    const expectedLeftReport = paddedReport(
      ethers.BigNumber.from(
        "0x" +
          "ffffffff".repeat(2) +
          paddedBlock(startBlock + 9) +
          paddedBlock(startBlock + 8) +
          paddedBlock(startBlock + 7) +
          paddedBlock(startBlock + 6) +
          paddedBlock(startBlock + 5) +
          paddedBlock(startBlock + 4)
      )
    );
    assert(
      leftReport === expectedLeftReport,
      `wrong left report
      expected  ${expectedLeftReport}
      got       ${leftReport}`
    );

    const resultOrNew = paddedReport(
      await combineTier.report(signers[0].address)
    );
    const expectedOrNew = paddedReport(
      ethers.BigNumber.from(
        "0x" +
          paddedBlock(startBlock + 13) +
          paddedBlock(startBlock + 13) +
          paddedBlock(startBlock + 12) +
          paddedBlock(startBlock + 11) +
          paddedBlock(startBlock + 10) +
          paddedBlock(startBlock + 6) +
          paddedBlock(startBlock + 5) +
          paddedBlock(startBlock + 4)
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

  it("should correctly combine ReadWriteTier reports with orLeft", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTierRight =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;
    const readWriteTierLeft =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;

    const vals = [
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

    const combineTierFactory = await ethers.getContractFactory("CombineTier");
    const combineTier = (await combineTierFactory.deploy({
      source,
      vals,
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

    const rightReport = paddedReport(
      await readWriteTierRight.report(signers[0].address)
    );
    const expectedRightReport = paddedReport(
      ethers.BigNumber.from(
        "0x" +
          paddedBlock(startBlock + 13) +
          paddedBlock(startBlock + 13) +
          paddedBlock(startBlock + 12) +
          paddedBlock(startBlock + 11) +
          paddedBlock(startBlock + 10) +
          paddedBlock(startBlock + 3) +
          paddedBlock(startBlock + 2) +
          paddedBlock(startBlock + 1)
      )
    );
    assert(
      rightReport === expectedRightReport,
      `wrong right report
      expected  ${expectedRightReport}
      got       ${rightReport}`
    );

    const leftReport = paddedReport(
      await readWriteTierLeft.report(signers[0].address)
    );
    const expectedLeftReport = paddedReport(
      ethers.BigNumber.from(
        "0x" +
          "ffffffff".repeat(2) +
          paddedBlock(startBlock + 9) +
          paddedBlock(startBlock + 8) +
          paddedBlock(startBlock + 7) +
          paddedBlock(startBlock + 6) +
          paddedBlock(startBlock + 5) +
          paddedBlock(startBlock + 4)
      )
    );
    assert(
      leftReport === expectedLeftReport,
      `wrong left report
      expected  ${expectedLeftReport}
      got       ${leftReport}`
    );

    const resultOrLeft = paddedReport(
      await combineTier.report(signers[0].address)
    );
    const expectedOrLeft = paddedReport(
      ethers.BigNumber.from(
        "0x" +
          paddedBlock(startBlock + 13) +
          paddedBlock(startBlock + 13) +
          paddedBlock(startBlock + 9) +
          paddedBlock(startBlock + 8) +
          paddedBlock(startBlock + 7) +
          paddedBlock(startBlock + 6) +
          paddedBlock(startBlock + 5) +
          paddedBlock(startBlock + 4)
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

const getConstants = async (combineTier: CombineTier) => `Constants:
MAX_SOURCE_LENGTH           ${await combineTier.MAX_SOURCE_LENGTH()}

OPCODE_END                  ${await combineTier.OPCODE_END()}

OPCODE_VAL                  ${await combineTier.OPCODE_VAL()}
OPCODE_CALL                 ${await combineTier.OPCODE_CALL()}

opcodeBlockNumber           ${await combineTier.opcodeBlockNumber()}

OPCODE_RESERVED_MAX         ${await combineTier.OPCODE_RESERVED_MAX()}

val0                        ${await combineTier.val0()}
val1                        ${await combineTier.val1()}
val2                        ${await combineTier.val2()}
val3                        ${await combineTier.val3()}
val4                        ${await combineTier.val4()}
val5                        ${await combineTier.val5()}
val6                        ${await combineTier.val6()}
val7                        ${await combineTier.val7()}
val8                        ${await combineTier.val8()}
val9                        ${await combineTier.val9()}
val10                       ${await combineTier.val10()}
val11                       ${await combineTier.val11()}
val12                       ${await combineTier.val12()}

source0                     ${await combineTier.source0()}
source1                     ${await combineTier.source1()}
source2                     ${await combineTier.source2()}
source3                     ${await combineTier.source3()}`;
