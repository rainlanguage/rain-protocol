import { assert } from "chai";
import { hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { TierChangeEvent } from "../../../typechain/contracts/test/tier/TierV2/ReadWriteTier";
import { max_uint256 } from "../../../utils/constants";
import {
  TIERS,
  uninitializedStatusAsNum,
} from "../../../utils/constants/readWriteTier";
import { deployReadWriteTier } from "../../../utils/deploy/readWriteTier";
import { getEventArgs } from "../../../utils/events";
import { getBlockTimestamp } from "../../../utils/hardhat";
import { assertError } from "../../../utils/test/assertError";
import { numArrayToReport, tierReport } from "../../../utils/tier";
import { Tier } from "../../../utils/types/tier";

describe("ReadWriteTier setTier", async function () {
  it("should support setting tier directly", async () => {
    const [signers, readWriteTier] = await deployReadWriteTier();

    const report0 = await readWriteTier.report(signers[1].address, []);
    const expectedReport0 = max_uint256;
    assert(
      report0.eq(expectedReport0),
      `signer 1 was not tier ZERO
            expected  ${expectedReport0}
            got       ${report0.toHexString()}`
    );

    await readWriteTier
      .connect(signers[1])
      .setTier(signers[1].address, Tier.ONE);

    const report1 = await readWriteTier.report(signers[1].address, []);
    const currentTimestampHex1 = ethers.BigNumber.from(
      await getBlockTimestamp()
    )
      .toHexString()
      .slice(2);
    const history1 =
      "0".repeat(8 - currentTimestampHex1.length) + currentTimestampHex1;
    const expectedReport1 = "0x" + "ffffffff".repeat(7) + history1;

    assert(
      report1.eq(expectedReport1),
      `signer 1 was not tier ONE
            expected  ${expectedReport1}
            got       ${report1.toHexString()}`
    );
  });

  it("will error if attempting to set tier to ZERO", async function () {
    const [signers, readWriteTier] = await deployReadWriteTier();
    await assertError(
      async () => {
        await readWriteTier.setTier(signers[0].address, 0);
      },
      "SET_ZERO_TIER",
      "failed to error due to setting ZERO tier"
    );
  });

  it("will fill multiple tiers at a time", async function () {
    const [signers, readWriteTier] = await deployReadWriteTier();
    let expected = tierReport(hexlify(max_uint256));
    let expectedReport = numArrayToReport(expected);
    let o = 0;
    let n = 0;
    while (o < TIERS.length) {
      n = Math.max(
        1,
        Math.min(o + Math.floor(Math.random() * TIERS.length), TIERS.length - 1)
      );

      await readWriteTier.setTier(signers[0].address, n);
      const block = await getBlockTimestamp();
      expected = expected.map((item: number, index: number) =>
        n - 1 >= index && index > o - 1 && n != o ? block : item
      );
      expectedReport = numArrayToReport(expected);
      if (expectedReport.eq(max_uint256)) {
        expected[0] = block;
        expectedReport = numArrayToReport(expected);
      }
      const actualReport =
        "0x" +
        (await readWriteTier.report(signers[0].address, []))
          .toHexString()
          .substring(2)
          .padStart(64, "0");

      assert(
        expectedReport.eq(actualReport),
        `wrong report
          expected  ${expectedReport}
          got       ${actualReport}`
      );
      o = n;

      if (o === TIERS.length - 1) break;
    }
  });

  it("will emit the tier to which it was upgraded if it is upgraded for the first time", async function () {
    const [signers, readWriteTier] = await deployReadWriteTier();

    // change the status to two and check if event emitted
    const event0 = (await getEventArgs(
      await readWriteTier.setTier(signers[0].address, 2),
      "TierChange",
      readWriteTier
    )) as TierChangeEvent["args"];

    assert(event0.sender === signers[0].address, "wrong sender in event0");
    assert(event0.account === signers[0].address, "wrong account in event0");
    assert(event0.startTier.eq(0), "wrong startTier in event0");
    assert(event0.endTier.eq(2), "wrong endTier in event0");
  });

  it("will return the current block number from level 0 to the new account tier if updated for the first time", async function () {
    const [signers, readWriteTier] = await deployReadWriteTier();
    // change the status to three
    await readWriteTier.setTier(signers[0].address, 3);
    // check with the contract
    const status = await readWriteTier.report(signers[0].address, []);
    const report = tierReport(status.toString());
    const currentTimestamp = await getBlockTimestamp();
    assert(report[0] === currentTimestamp);
    assert(report[1] === currentTimestamp);
    assert(report[2] === currentTimestamp);
  });

  it("will output the previous tier and the new updated tier", async function () {
    const [signers, readWriteTier] = await deployReadWriteTier();
    // change the status to one
    await readWriteTier.setTier(signers[0].address, 1);
    // change the status to three
    const event0 = (await getEventArgs(
      await readWriteTier.setTier(signers[0].address, 3),
      "TierChange",
      readWriteTier
    )) as TierChangeEvent["args"];

    assert(event0.sender === signers[0].address, "wrong sender in event0");
    assert(event0.account === signers[0].address, "wrong account in event0");
    assert(event0.startTier.eq(1), "wrong startTier in event0");
    assert(event0.endTier.eq(3), "wrong endTier in event0");
  });

  it("will return the previous block number at the lower tier if it is updated to a higher tier", async function () {
    const [signers, readWriteTier] = await deployReadWriteTier();
    // change the status to one
    await readWriteTier.setTier(signers[0].address, 1);
    const previousTimestamp = await getBlockTimestamp();
    // change the status to three
    await readWriteTier.setTier(signers[0].address, 3);
    // check with the contract
    const status = await readWriteTier.report(signers[0].address, []);
    const report = tierReport(status.toString());
    assert(report[0] === previousTimestamp);
  });

  it("will change the tier from higher to lower", async function () {
    const [signers, readWriteTier] = await deployReadWriteTier();
    // change the tier to three
    await readWriteTier.setTier(signers[0].address, 3);
    // change the tier to one
    const event0 = (await getEventArgs(
      await readWriteTier.setTier(signers[0].address, 1),
      "TierChange",
      readWriteTier
    )) as TierChangeEvent["args"];

    assert(event0.sender === signers[0].address, "wrong sender in event0");
    assert(event0.account === signers[0].address, "wrong account in event0");
    assert(event0.startTier.eq(3), "wrong startTier in event0");
    assert(event0.endTier.eq(1), "wrong endTier in event0");
  });

  it("will return the previous block number at the current level if updating from a higher to a lower tier", async function () {
    const [signers, readWriteTier] = await deployReadWriteTier();
    // change the tier to three
    await readWriteTier.setTier(signers[0].address, 3);
    const previousTimestamp = await getBlockTimestamp();
    // change the tier to one
    await readWriteTier.setTier(signers[0].address, 1);
    // check with the contract
    const status = await readWriteTier.report(signers[0].address, []);
    const report = tierReport(status.toString());
    assert(report[0] === previousTimestamp);
  });

  it("will return the original block number if tier 1 is called again", async function () {
    const [signers, readWriteTier] = await deployReadWriteTier();
    // change the tier to anything above 1
    await readWriteTier.setTier(
      signers[0].address,
      Math.max(1, Math.floor(Math.random() * TIERS.length))
    );
    const originalBlock = await getBlockTimestamp();
    // change the tier to one
    await readWriteTier.setTier(signers[0].address, 1);
    // check with the contract
    const status = await readWriteTier.report(signers[0].address, []);
    const report = tierReport(status.toString());
    assert(report[0] === originalBlock);
  });

  it("will return original block number at current tier and the rest at uninitializedStatusAsNum after two continuous decrements", async function () {
    const [signers, readWriteTier] = await deployReadWriteTier();
    // change the tier to three
    await readWriteTier.setTier(signers[0].address, 3);
    const originalBlock = await getBlockTimestamp();

    // change the tier to two
    await readWriteTier.setTier(signers[0].address, 2);
    // change the tier to one
    await readWriteTier.setTier(signers[0].address, 1);

    // check with the contract
    const status = await readWriteTier.report(signers[0].address, []);
    const report = tierReport(status.toString());
    assert(report[2] === uninitializedStatusAsNum);
    assert(report[1] === uninitializedStatusAsNum);
    assert(report[0] === originalBlock);
  });

  it("will return two different block numbers if two consecutive increments occur, the high bits will be uninitializedStatusAsNum", async function () {
    const [signers, readWriteTier] = await deployReadWriteTier();
    // change the tier to two
    await readWriteTier.setTier(signers[0].address, 2);

    // change the tier to four
    await readWriteTier.setTier(signers[0].address, 4);

    // check with the contract
    const status = await readWriteTier.report(signers[0].address, []);
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
