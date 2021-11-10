import chai from "chai";
import { solidity } from "ethereum-waffle";
import type { Contract } from "ethers";
import { ethers } from "hardhat";
import type { ERC20BalanceTier } from "../../typechain/ERC20BalanceTier";
import type { ReserveTokenTest } from "../../typechain/ReserveTokenTest";
import { assertError, basicDeploy, eighteenZeros } from "../Util";

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

const LEVELS = Array.from(Array(8).keys()).map((value) =>
  ethers.BigNumber.from(++value + eighteenZeros)
); // [1,2,3,4,5,6,7,8]
const LEVEL_SIZE_LINEAR = ethers.BigNumber.from(1 + eighteenZeros);

describe("ERC20BalanceTier", async function () {
  let owner: any;
  let alice: any;
  let erc20BalanceTier: ERC20BalanceTier;
  let reserve: ReserveTokenTest & Contract;

  beforeEach(async () => {
    [owner, alice] = await ethers.getSigners();

    reserve = (await basicDeploy("ReserveTokenTest", {})) as ReserveTokenTest &
      Contract;

    const erc20BalanceTierFactory = await ethers.getContractFactory(
      "ERC20BalanceTier"
    );
    erc20BalanceTier = (await erc20BalanceTierFactory.deploy(
      reserve.address,
      LEVELS
    )) as ERC20BalanceTier & Contract;

    await erc20BalanceTier.deployed();
  });

  it("should not be possible to set tier directly", async function () {
    await assertError(
      async () => await erc20BalanceTier.setTier(owner.address, Tier.ONE, []),
      "revert SET_TIER",
      "tier was wrongly set directly"
    );
  });

  it("should report current tier according to current ERC20 balance", async function () {
    const tier0 = await erc20BalanceTier.report(alice.address);
    const expectedReport0 =
      "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF";
    assert(
      ethers.BigNumber.from(expectedReport0).eq(tier0),
      `expected ${expectedReport0} got ${tier0.toHexString()}`
    );

    await reserve.transfer(alice.address, LEVEL_SIZE_LINEAR);

    const tier1 = await erc20BalanceTier.report(alice.address);
    const expectedReport1 =
      "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000";
    assert(
      ethers.BigNumber.from(expectedReport1).eq(tier1),
      `expected ${expectedReport1} got ${tier1.toHexString()}`
    );

    await reserve.transfer(alice.address, LEVEL_SIZE_LINEAR);

    const tier2 = await erc20BalanceTier.report(alice.address);
    const expectedReport2 =
      "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0000000000000000";
    assert(
      ethers.BigNumber.from(expectedReport2).eq(tier2),
      `expected ${expectedReport2} got ${tier2.toHexString()}`
    );

    await reserve.transfer(alice.address, LEVEL_SIZE_LINEAR);

    const tier3 = await erc20BalanceTier.report(alice.address);
    const expectedReport3 =
      "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF000000000000000000000000";
    assert(
      ethers.BigNumber.from(expectedReport3).eq(tier3),
      `expected ${expectedReport3} got ${tier3.toHexString()}`
    );

    await reserve.transfer(alice.address, LEVEL_SIZE_LINEAR);

    const tier4 = await erc20BalanceTier.report(alice.address);
    const expectedReport4 =
      "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000000000000000000000000000";
    assert(
      ethers.BigNumber.from(expectedReport4).eq(tier4),
      `expected ${expectedReport4} got ${tier4.toHexString()}`
    );

    await reserve.transfer(alice.address, LEVEL_SIZE_LINEAR);

    const tier5 = await erc20BalanceTier.report(alice.address);
    const expectedReport5 =
      "0xFFFFFFFFFFFFFFFFFFFFFFFF0000000000000000000000000000000000000000";
    assert(
      ethers.BigNumber.from(expectedReport5).eq(tier5),
      `expected ${expectedReport5} got ${tier5.toHexString()}`
    );

    await reserve.transfer(alice.address, LEVEL_SIZE_LINEAR);

    const tier6 = await erc20BalanceTier.report(alice.address);
    const expectedReport6 =
      "0xFFFFFFFFFFFFFFFF000000000000000000000000000000000000000000000000";
    assert(
      ethers.BigNumber.from(expectedReport6).eq(tier6),
      `expected ${expectedReport6} got ${tier6.toHexString()}`
    );

    await reserve.transfer(alice.address, LEVEL_SIZE_LINEAR);

    const tier7 = await erc20BalanceTier.report(alice.address);
    const expectedReport7 =
      "0xFFFFFFFF00000000000000000000000000000000000000000000000000000000";
    assert(
      ethers.BigNumber.from(expectedReport7).eq(tier7),
      `expected ${expectedReport7} got ${tier7.toHexString()}`
    );

    await reserve.transfer(alice.address, LEVEL_SIZE_LINEAR);

    const tier8 = await erc20BalanceTier.report(alice.address);
    const expectedReport8 = "0x0";
    assert(
      ethers.BigNumber.from(expectedReport8).eq(tier8),
      `expected ${expectedReport8} got ${tier8.toHexString()}`
    );
  });
});
