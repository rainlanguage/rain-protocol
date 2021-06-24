/*

import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { TVKTransferTier } from '../typechain/TVKTransferTier'
import type { ReserveToken } from '../typechain/ReserveToken'
import { assertError, basicDeploy, eighteenZeros } from './Util'
import type { BigNumber } from 'ethers'

chai.use(solidity)
const { expect, assert } = chai

enum Tier {
  ZERO,
  ONE,
  TWO,
  THREE,
  FOUR,
  FIVE,
  SIX,
  SEVEN,
  EIGHT
}


describe("TVKTransferTier", async function () {
  let owner: any;
  let alice: any;
  let tvkTransferTier: TVKTransferTier;
  let tvkReserve: ReserveToken;
  let LEVELS: BigNumber[]

  beforeEach(async () => {
    [owner, alice] = await ethers.getSigners()

    tvkReserve = (await basicDeploy("ReserveToken", {})) as ReserveToken

    const tvkTransferTierFactory = await ethers.getContractFactory(
      'TVKTransferTier'
    );

    tvkTransferTier = await tvkTransferTierFactory.deploy() as TVKTransferTier

    await tvkTransferTier.deployed()

    LEVELS = await tvkTransferTier.levels()
  });

  it('should restrict setting ZERO tier', async () => {
    await assertError(
      async () => await tvkTransferTier.connect(alice).setTier(alice.address, Tier.ZERO, []),
      "revert SET_ZERO_TIER",
      "alice directly set to tier ZERO"
    )
  })

  it("should require transferring TVK tokens to set tier directly", async function () {
    // alice has current tier of ZERO
    const report0 = await tvkTransferTier.report(alice.address)
    const expectedReport0 = "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"
    const currentBlockHex0 = ethers.BigNumber.from(await ethers.provider.getBlockNumber()).toHexString().slice(2)
    const history0 = "0".repeat(8)
    const history1 = "0".repeat(8 - currentBlockHex0.length) + currentBlockHex0
    assert(
      report0.eq(expectedReport0),
      `alice was not tier ZERO
      expected  ${expectedReport0}
      got       ${report0.toHexString()}`
    )

    // alice needs TVK balance equal to difference between current tier and desired tier
    const requiredForTier2 = LEVELS[2].sub(LEVELS[0]);

    // give alice enough reserve
    await tvkReserve.transfer(alice.address, requiredForTier2)
    assert((await tvkReserve.balanceOf(alice.address)).eq(requiredForTier2), "alice has wrong required reserve balance")

    // alice sets their tier to TWO
    await tvkReserve.connect(alice).approve(tvkTransferTier.address, requiredForTier2)
    const setTier2Promise = tvkTransferTier.connect(alice).setTier(alice.address, Tier.TWO, [])

    await expect(setTier2Promise).to.emit(tvkTransferTier, "TierChange").withArgs(alice.address, Tier.ZERO, Tier.TWO)

    await setTier2Promise;

    // alice has current tier of TWO
    const report2 = await tvkTransferTier.report(alice.address)
    const currentBlockHex2 = ethers.BigNumber.from(await ethers.provider.getBlockNumber()).toHexString().slice(2)
    const history2 = "0".repeat(8 - currentBlockHex2.length) + currentBlockHex2
    const expectedReport2 = "0xffffffffffffffffffffffffffffffffffffffff" + history2 + history1 + history0

    assert(
      report2.eq(expectedReport2),
      `alice was not set to tier TWO
      expected  ${expectedReport2}
      got       ${report2.toHexString()}`
    )
  });
});

*/