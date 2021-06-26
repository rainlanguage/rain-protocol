import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { ValueTier } from '../typechain/ValueTier'
import { assertError, basicDeploy, eighteenZeros } from './Util'

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

const LEVELS = Array.from(Array(8).keys()).map(value => ethers.BigNumber.from(++value + eighteenZeros));

describe("ValueTier", async function () {
  let owner: any;
  let alice: any;
  let bob: any;
  let valueTier: ValueTier

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners()

    const valueTierFactory = await ethers.getContractFactory(
      'ValueTier'
    );

    valueTier = await valueTierFactory.deploy(LEVELS) as ValueTier

    await valueTier.deployed()
  });

  it('should set tierValues on construction', async () => {
    assert(
      (await valueTier.tierValues(0)).eq(LEVELS[0]),
      "tier value at position 0 was not set"
    )
    assert(
      (await valueTier.tierValues(1)).eq(LEVELS[1]),
      "tier value at position 1 was not set"
    )
    assert(
      (await valueTier.tierValues(2)).eq(LEVELS[2]),
      "tier value at position 2 was not set"
    )
    assert(
      (await valueTier.tierValues(3)).eq(LEVELS[3]),
      "tier value at position 3 was not set"
    )
    assert(
      (await valueTier.tierValues(4)).eq(LEVELS[4]),
      "tier value at position 4 was not set"
    )
    assert(
      (await valueTier.tierValues(5)).eq(LEVELS[5]),
      "tier value at position 5 was not set"
    )
    assert(
      (await valueTier.tierValues(6)).eq(LEVELS[6]),
      "tier value at position 6 was not set"
    )
    assert(
      (await valueTier.tierValues(7)).eq(LEVELS[7]),
      "tier value at position 7 was not set"
    )
  })

  it('should return all the values in a list rather than requiring an index be specified', async () => {
    const tierValues = await valueTier.getTierValues()

    assert(
      tierValues.every((value, index) => value.eq(LEVELS[index])),
      `did not return the correct tierValue list
      expected  ${LEVELS}
      got       ${tierValues}`
    )
  })

  it('should convert a Tier to the minimum value it requires for all tiers, including ZERO tier', async () => {
    assert((await valueTier.tierToValue(Tier.ZERO)).eq(0))
    assert((await valueTier.tierToValue(Tier.ONE)).eq(LEVELS[0]))
    assert((await valueTier.tierToValue(Tier.TWO)).eq(LEVELS[1]))
    assert((await valueTier.tierToValue(Tier.THREE)).eq(LEVELS[2]))
    assert((await valueTier.tierToValue(Tier.FOUR)).eq(LEVELS[3]))
    assert((await valueTier.tierToValue(Tier.FIVE)).eq(LEVELS[4]))
    assert((await valueTier.tierToValue(Tier.SIX)).eq(LEVELS[5]))
    assert((await valueTier.tierToValue(Tier.SEVEN)).eq(LEVELS[6]))
    assert((await valueTier.tierToValue(Tier.EIGHT)).eq(LEVELS[7]))
  })

  it('should convert a value to the maximum Tier it qualifies for', async () => {
    assert((await valueTier.valueToTier(0)).eq(Tier.ZERO))
    assert((await valueTier.valueToTier(LEVELS[0])).eq(Tier.ONE))
    
    assert((await valueTier.valueToTier(LEVELS[1])).eq(Tier.TWO))
    assert((await valueTier.valueToTier(LEVELS[1].add(1))).eq(Tier.TWO))
    assert((await valueTier.valueToTier(LEVELS[1].sub(1))).eq(Tier.ONE))

    assert((await valueTier.valueToTier(LEVELS[2])).eq(Tier.THREE))
    assert((await valueTier.valueToTier(LEVELS[3])).eq(Tier.FOUR))
    assert((await valueTier.valueToTier(LEVELS[4])).eq(Tier.FIVE))
    assert((await valueTier.valueToTier(LEVELS[5])).eq(Tier.SIX))
    assert((await valueTier.valueToTier(LEVELS[6])).eq(Tier.SEVEN))
    assert((await valueTier.valueToTier(LEVELS[7])).eq(Tier.EIGHT))
  })
});
