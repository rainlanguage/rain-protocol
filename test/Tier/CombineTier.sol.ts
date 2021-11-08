import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import { concat } from "ethers/lib/utils";
import { bytify, op } from "../Util";

import type { CombineTier } from "../../typechain/CombineTier";

chai.use(solidity);
const { expect, assert } = chai;

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
  it("should correctly combine AlwaysTier and NeverTier reports with andNew", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alwaysTierFactory = await ethers.getContractFactory("AlwaysTier");
    const alwaysTier = await alwaysTierFactory.deploy();

    const neverTierFactory = await ethers.getContractFactory("NeverTier");
    const neverTier = await neverTierFactory.deploy();

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
    })) as CombineTier;

    const blockNumber = await ethers.provider.getBlockNumber();

    const stack = await combineTier.reportStack(signers[0].address);

    console.log(`stack vals: ${stack.vals}`);

    const result = await combineTier.report(signers[0].address);

    const expected = 0;
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
    const alwaysTier = await alwaysTierFactory.deploy();

    const neverTierFactory = await ethers.getContractFactory("NeverTier");
    const neverTier = await neverTierFactory.deploy();

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
    })) as CombineTier;

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
    })) as CombineTier;

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
    })) as CombineTier;

    const result = await combineTier.report(signers[1].address);
    const expected = signers[1].address;
    assert(
      result.eq(expected),
      `wrong account address
      expected  ${expected}
      got       ${result}`
    );
  });
});

const getConstants = async (combineTier: CombineTier) => `Constants:
MAX_SOURCE_LENGTH           ${await combineTier.MAX_SOURCE_LENGTH()}

OPCODE_END                  ${await combineTier.OPCODE_END()}

OPCODE_VAL                  ${await combineTier.OPCODE_VAL()}
OPCODE_CALL                 ${await combineTier.OPCODE_CALL()}

OPCODE_BLOCK_NUMBER         ${await combineTier.OPCODE_BLOCK_NUMBER()}

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
