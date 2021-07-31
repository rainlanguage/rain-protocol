import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { ValueTierTest } from '../typechain/ValueTierTest'
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

describe("ValueTierTest", async function () {
  let owner: any;
  let alice: any;
  let bob: any;
  let valueTier: ValueTierTest

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners()

    const valueTierFactory = await ethers.getContractFactory(
      'ValueTierTest'
    );

    valueTier = await valueTierFactory.deploy(LEVELS) as ValueTierTest

    await valueTier.deployed()
  });

  it('should set tierValues on construction', async () => {
    assert(
      (await valueTier.tierValues())[0].eq(LEVELS[0]),
      "tier value at position 0 was not set"
    )
    assert(
      (await valueTier.tierValues())[1].eq(LEVELS[1]),
      "tier value at position 1 was not set"
    )
    assert(
      (await valueTier.tierValues())[2].eq(LEVELS[2]),
      "tier value at position 2 was not set"
    )
    assert(
      (await valueTier.tierValues())[3].eq(LEVELS[3]),
      "tier value at position 3 was not set"
    )
    assert(
      (await valueTier.tierValues())[4].eq(LEVELS[4]),
      "tier value at position 4 was not set"
    )
    assert(
      (await valueTier.tierValues())[5].eq(LEVELS[5]),
      "tier value at position 5 was not set"
    )
    assert(
      (await valueTier.tierValues())[6].eq(LEVELS[6]),
      "tier value at position 6 was not set"
    )
    assert(
      (await valueTier.tierValues())[7].eq(LEVELS[7]),
      "tier value at position 7 was not set"
    )
  })

  it('should return all the values in a list rather than requiring an index be specified', async () => {
    const tierValues = await valueTier.tierValues()

    assert(
      tierValues.every((value:any, index:any) => value.eq(LEVELS[index])),
      `did not return the correct tierValue list
      expected  ${LEVELS}
      got       ${tierValues}`
    )
  })

  it('should convert a Tier to the minimum value it requires for all tiers, including ZERO tier', async () => {
    assert((await valueTier.wrappedTierToValue(Tier.ZERO)).eq(0))
    assert((await valueTier.wrappedTierToValue(Tier.ONE)).eq(LEVELS[0]))
    assert((await valueTier.wrappedTierToValue(Tier.TWO)).eq(LEVELS[1]))
    assert((await valueTier.wrappedTierToValue(Tier.THREE)).eq(LEVELS[2]))
    assert((await valueTier.wrappedTierToValue(Tier.FOUR)).eq(LEVELS[3]))
    assert((await valueTier.wrappedTierToValue(Tier.FIVE)).eq(LEVELS[4]))
    assert((await valueTier.wrappedTierToValue(Tier.SIX)).eq(LEVELS[5]))
    assert((await valueTier.wrappedTierToValue(Tier.SEVEN)).eq(LEVELS[6]))
    assert((await valueTier.wrappedTierToValue(Tier.EIGHT)).eq(LEVELS[7]))
  })

  it('should convert a value to the maximum Tier it qualifies for', async () => {
    assert((await valueTier.wrappedValueToTier(0)) === Tier.ZERO)
    assert((await valueTier.wrappedValueToTier(LEVELS[0])) === Tier.ONE)

    assert((await valueTier.wrappedValueToTier(LEVELS[1])) === Tier.TWO)
    assert((await valueTier.wrappedValueToTier(LEVELS[1].add(1))) === Tier.TWO)
    assert((await valueTier.wrappedValueToTier(LEVELS[1].sub(1))) === Tier.ONE)

    assert((await valueTier.wrappedValueToTier(LEVELS[2])) === Tier.THREE)
    assert((await valueTier.wrappedValueToTier(LEVELS[3])) === Tier.FOUR)
    assert((await valueTier.wrappedValueToTier(LEVELS[4])) === Tier.FIVE)
    assert((await valueTier.wrappedValueToTier(LEVELS[5])) === Tier.SIX)
    assert((await valueTier.wrappedValueToTier(LEVELS[6])) === Tier.SEVEN)
    assert((await valueTier.wrappedValueToTier(LEVELS[7])) === Tier.EIGHT)
  })
});
