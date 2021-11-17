import chai from "chai";
import { solidity } from "ethereum-waffle";
import type { Contract } from "ethers";
import { ethers } from "hardhat";
import type { AlwaysTier } from "../../typechain/AlwaysTier";
import type { NeverTier } from "../../typechain/NeverTier";
import { assertError } from "../Util";

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

describe("AlwaysTier", async function () {
  let owner: any;
  let alwaysTier: any;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();

    const alwaysTierFactory = await ethers.getContractFactory("AlwaysTier");

    alwaysTier = (await alwaysTierFactory.deploy()) as AlwaysTier & Contract;

    await alwaysTier.deployed();
  });

  it("should always return 0x00 report", async function () {
    const report = await alwaysTier.report(owner.address);

    assert(report.eq(0x00), `expected 0x00 got ${report}`);
  });

  it("should not be possible to set tier directly", async function () {
    await assertError(
      async () => await alwaysTier.setTier(owner.address, Tier.ONE, []),
      "revert SET_TIER",
      "tier was wrongly set directly"
    );
  });
});

describe("NeverTier", async function () {
  let owner: any;
  let neverTier: any;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();

    const neverTierFactory = await ethers.getContractFactory("NeverTier");

    neverTier = (await neverTierFactory.deploy()) as NeverTier & Contract;

    await neverTier.deployed();
  });

  it("should always return 0xFF report", async function () {
    const report = await neverTier.report(owner.address);

    const MAX_UINT256 = ethers.BigNumber.from(
      "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"
    );

    assert(report.eq(MAX_UINT256), `expected ${MAX_UINT256}... got ${report}`);
  });

  it("should not be possible to set tier directly", async function () {
    await assertError(
      async () => await neverTier.setTier(owner.address, Tier.ONE, []),
      "revert SET_TIER",
      "tier was wrongly set directly"
    );
  });
});
