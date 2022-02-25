import chai from "chai";
import { ethers } from "hardhat";
import type {
  ReadWriteTier,
  TierChangeEvent,
} from "../../typechain/ReadWriteTier";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  tierReport,
  blockNumbersToReport,
  assertError,
  getEventArgs,
} from "../Util";
import type { Contract } from "ethers";

const { assert } = chai;

const uninitializedReport =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const uninitializedStatusAsNum = 4294967295;
const zero = 0;
const one = 1;
const two = 2;
const three = 3;
const four = 4;
const five = 5;
const six = 6;
const seven = 7;
const eight = 8;
const tiers = [zero, one, two, three, four, five, six, seven, eight];

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

const setup = async (): Promise<
  [SignerWithAddress[], ReadWriteTier & Contract]
> => {
  const signers = await ethers.getSigners();
  const readWriteTierFactory = await ethers.getContractFactory("ReadWriteTier");
  const readWriteTier = (await readWriteTierFactory.deploy()) as ReadWriteTier &
    Contract;
  await readWriteTier.deployed();
  return [signers, readWriteTier];
};

describe("Account tier", async function () {
  it("should support setting tier directly", async () => {
    const [signers, readWriteTier] = await setup();

    const report0 = await readWriteTier.report(signers[1].address);
    const expectedReport0 =
      "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF";
    assert(
      report0.eq(expectedReport0),
      `signer 1 was not tier ZERO
            expected  ${expectedReport0}
            got       ${report0.toHexString()}`
    );

    await readWriteTier
      .connect(signers[1])
      .setTier(signers[1].address, Tier.ONE, []);

    const report1 = await readWriteTier.report(signers[1].address);
    const currentBlockHex1 = ethers.BigNumber.from(
      await ethers.provider.getBlockNumber()
    )
      .toHexString()
      .slice(2);
    const history1 = "0".repeat(8 - currentBlockHex1.length) + currentBlockHex1;
    const expectedReport1 =
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffff" + history1;

    assert(
      report1.eq(expectedReport1),
      `signer 1 was not tier ONE
            expected  ${expectedReport1}
            got       ${report1.toHexString()}`
    );
  });

  it("will return uninitialized report if nothing set", async function () {
    const [signers, readWriteTier] = await setup();
    for (const signer of signers) {
      const status = await readWriteTier.report(signer.address);
      assert(ethers.BigNumber.from(uninitializedReport).eq(status));
    }
  });

  it("will error if attempting to set tier to ZERO", async function () {
    const [signers, readWriteTier] = await setup();
    await assertError(
      async () => {
        await readWriteTier.setTier(signers[0].address, zero, []);
      },
      "SET_ZERO_TIER",
      "failed to error due to setting ZERO tier"
    );
  });

  it("will return tier if set", async function () {
    const [signers, readWriteTier] = await setup();
    const expected = tierReport(uninitializedReport);
    let expectedReport = blockNumbersToReport(expected);
    let i = 0;
    for (const tier of tiers) {
      if (tier) {
        await readWriteTier.setTier(signers[0].address, tier, []);
        expected[i] = await ethers.provider.getBlockNumber();
        expectedReport = blockNumbersToReport(expected);
        i++;
      }
      const actualReport = (await readWriteTier.report(signers[0].address))
        .toHexString()
        .substring(2)
        .padStart(64, "0");
      assert(expectedReport === actualReport);
    }
  });

  it("will fill multiple tiers at a time", async function () {
    const [signers, readWriteTier] = await setup();
    let expected = tierReport(uninitializedReport);
    let expectedReport = blockNumbersToReport(expected);
    let o = 0;
    let n = 0;
    while (o < tiers.length) {
      n = Math.max(
        1,
        Math.min(o + Math.floor(Math.random() * tiers.length), tiers.length - 1)
      );

      await readWriteTier.setTier(signers[0].address, n, []);
      const block = await ethers.provider.getBlockNumber();
      expected = expected.map((item: number, index: number) =>
        n - 1 >= index && index > o - 1 && n != o ? block : item
      );
      expectedReport = blockNumbersToReport(expected);
      if (expectedReport == uninitializedReport) {
        expected[0] = block;
        expectedReport = blockNumbersToReport(expected);
      }
      const actualReport = (await readWriteTier.report(signers[0].address))
        .toHexString()
        .substring(2)
        .padStart(64, "0");
      assert(expectedReport === actualReport);
      o = n;

      if (o === tiers.length - 1) break;
    }
  });

  it("will emit the tier to which it was upgraded if it is upgraded for the first time", async function () {
    const [signers, readWriteTier] = await setup();

    // change the status to two and check if event emitted
    const event0 = (await getEventArgs(
      await readWriteTier.setTier(signers[0].address, 2, []),
      "TierChange",
      readWriteTier
    )) as TierChangeEvent["args"];

    assert(event0.sender === signers[0].address, "wrong sender in event0");
    assert(event0.account === signers[0].address, "wrong account in event0");
    assert(event0.startTier.eq(0), "wrong startTier in event0");
    assert(event0.endTier.eq(2), "wrong endTier in event0");
  });

  it("will return the current block number from level 0 to the new account tier if updated for the first time", async function () {
    const [signers, readWriteTier] = await setup();
    // change the status to three
    await readWriteTier.setTier(signers[0].address, 3, []);
    // check with the contract
    const status = await readWriteTier.report(signers[0].address);
    const report = tierReport(status.toString());
    const currentBlock = await readWriteTier.provider.getBlockNumber();
    assert(report[0] === currentBlock);
    assert(report[1] === currentBlock);
    assert(report[2] === currentBlock);
  });

  it("will output the previous tier and the new updated tier", async function () {
    const [signers, readWriteTier] = await setup();
    // change the status to one
    await readWriteTier.setTier(signers[0].address, 1, []);
    // change the status to three
    const event0 = (await getEventArgs(
      await readWriteTier.setTier(signers[0].address, 3, []),
      "TierChange",
      readWriteTier
    )) as TierChangeEvent["args"];

    assert(event0.sender === signers[0].address, "wrong sender in event0");
    assert(event0.account === signers[0].address, "wrong account in event0");
    assert(event0.startTier.eq(1), "wrong startTier in event0");
    assert(event0.endTier.eq(3), "wrong endTier in event0");
  });

  it("will return the previous block number at the lower tier if it is updated to a higher tier", async function () {
    const [signers, readWriteTier] = await setup();
    // change the status to one
    const tx = await readWriteTier.setTier(signers[0].address, 1, []);
    const previousBlock = tx.blockNumber;
    // change the status to three
    await readWriteTier.setTier(signers[0].address, 3, []);
    // check with the contract
    const status = await readWriteTier.report(signers[0].address);
    const report = tierReport(status.toString());
    assert(report[0] === previousBlock);
  });

  it("will change the tier from higher to lower", async function () {
    const [signers, readWriteTier] = await setup();
    // change the tier to three
    await readWriteTier.setTier(signers[0].address, 3, []);
    // change the tier to one
    const event0 = (await getEventArgs(
      await readWriteTier.setTier(signers[0].address, 1, []),
      "TierChange",
      readWriteTier
    )) as TierChangeEvent["args"];

    assert(event0.sender === signers[0].address, "wrong sender in event0");
    assert(event0.account === signers[0].address, "wrong account in event0");
    assert(event0.startTier.eq(3), "wrong startTier in event0");
    assert(event0.endTier.eq(1), "wrong endTier in event0");
  });

  it("will return the previous block number at the current level if updating from a higher to a lower tier", async function () {
    const [signers, readWriteTier] = await setup();
    // change the tier to three
    const tx = await readWriteTier.setTier(signers[0].address, 3, []);
    const previousBlock = tx.blockNumber;
    // change the tier to one
    await readWriteTier.setTier(signers[0].address, 1, []);
    // check with the contract
    const status = await readWriteTier.report(signers[0].address);
    const report = tierReport(status.toString());
    assert(report[0] === previousBlock);
  });

  it("will be possible to know the previous tier from the current tier", async function () {
    const [signers, readWriteTier] = await setup();
    // change the tier to one
    await readWriteTier.setTier(signers[0].address, 1, []);
    const previousBlock = await readWriteTier.provider.getBlockNumber();
    // change the tier to three
    await readWriteTier.setTier(signers[0].address, 3, []);
    // check with the contract
    const status = await readWriteTier.report(signers[0].address);
    const report = tierReport(status.toString());
    assert(report[0] === previousBlock);
  });

  it("will return the original block number if tier 1 is called again", async function () {
    const [signers, readWriteTier] = await setup();
    // change the tier to anything above 1
    await readWriteTier.setTier(
      signers[0].address,
      Math.max(1, Math.floor(Math.random() * tiers.length)),
      []
    );
    const originalBlock = await readWriteTier.provider.getBlockNumber();
    // change the tier to one
    await readWriteTier.setTier(signers[0].address, 1, []);
    // check with the contract
    const status = await readWriteTier.report(signers[0].address);
    const report = tierReport(status.toString());
    assert(report[0] === originalBlock);
  });

  it("will return original block number at current tier and the rest at uninitializedStatusAsNum after two continuous decrements", async function () {
    const [signers, readWriteTier] = await setup();
    // change the tier to three
    await readWriteTier.setTier(signers[0].address, 3, []);
    const originalBlock = await readWriteTier.provider.getBlockNumber();

    // change the tier to two
    await readWriteTier.setTier(signers[0].address, 2, []);
    // change the tier to one
    await readWriteTier.setTier(signers[0].address, 1, []);

    // check with the contract
    const status = await readWriteTier.report(signers[0].address);
    const report = tierReport(status.toString());
    assert(report[2] === uninitializedStatusAsNum);
    assert(report[1] === uninitializedStatusAsNum);
    assert(report[0] === originalBlock);
  });

  it("will return two different block numbers if two consecutive increments occur, the high bits will be uninitializedStatusAsNum", async function () {
    const [signers, readWriteTier] = await setup();
    // change the tier to two
    await readWriteTier.setTier(signers[0].address, 2, []);

    // change the tier to four
    await readWriteTier.setTier(signers[0].address, 4, []);

    // check with the contract
    const status = await readWriteTier.report(signers[0].address);
    const report = tierReport(status.toString());
    assert(report[0] === report[1]);
    assert(report[1] < report[2]);
    assert(report[2] === report[3]);
    assert(report[4] === uninitializedStatusAsNum);
    assert(report[5] === uninitializedStatusAsNum);
    assert(report[6] === uninitializedStatusAsNum);
    assert(report[7] === uninitializedStatusAsNum);
  });
});
