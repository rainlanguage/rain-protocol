import { ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import type { Trust } from "../typechain/Trust"
import type { ReserveToken } from "../typechain/ReserveToken"
import * as Util from './Util'
import { utils } from "ethers";
import type { Prestige } from "../typechain/Prestige";

chai.use(solidity);
const { expect, assert } = chai;

const trustJson = require('../artifacts/contracts/Trust.sol/Trust.json')
const poolJson = require('../artifacts/contracts/RedeemableERC20Pool.sol/RedeemableERC20Pool.json')
const bPoolJson = require('../artifacts/contracts/configurable-rights-pool/contracts/test/BPool.sol/BPool.json')
const reserveJson = require('../artifacts/contracts/test/ReserveToken.sol/ReserveToken.json')
const redeemableTokenJson = require('../artifacts/contracts/RedeemableERC20.sol/RedeemableERC20.json')
const crpJson = require('../artifacts/contracts/configurable-rights-pool/contracts/ConfigurableRightsPool.sol/ConfigurableRightsPool.json')

enum Status {
  NIL = 0,
  COPPER = 1,
  BRONZE = 2,
  SILVER = 3,
  GOLD = 4,
  PLATINUM = 5,
  DIAMOND = 6,
  CHAD = 7,
  JAWAD = 8,
}

describe("TrustTrade", async function() {
  it('should not hit max weight (50:1) during weight changes', async function () {
    this.timeout(0)

    const signers = await ethers.getSigners()

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy()

    const reserve = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

    const prestigeFactory = await ethers.getContractFactory(
      'Prestige'
    )
    const prestige = await prestigeFactory.deploy() as Prestige
    const minimumStatus = Status.NIL

    const trustFactory = await ethers.getContractFactory(
      'Trust',
      {
        libraries: {
          'RightsManager': rightsManager.address
        }
      }
    )

    const tokenName = 'Token'
    const tokenSymbol = 'TKN'

    // initial reserve and token supply 1:1 for simplicity
    const reserveInit = ethers.BigNumber.from('2000' + Util.eighteenZeros)
    const redeemInit = ethers.BigNumber.from('2000' + Util.eighteenZeros)
    
    const initialValuation1 = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const initialValuation2 = ethers.BigNumber.from('10000' + Util.eighteenZeros)
    
    const totalTokenSupply1 = ethers.BigNumber.from('2000' + Util.eighteenZeros)
    const totalTokenSupply2 = ethers.BigNumber.from('10000' + Util.eighteenZeros)
    
    // Token spot price = initial valuation / total token    
    // const spotInit = initialValuation.div(totalTokenSupply)
    
    // Weight ratio
    // Wt / Wr = Spot * Bt / Br
    
    // Bt / Br = 1 (in our case)
    // Hence, Wt / Wr = Spot

    // console.log(`Weight Ratio Wt/Wr ${
    //   spotInit
    //   .mul(redeemInit.div(reserveInit)
    // )}`);

    const minCreatorRaise = ethers.BigNumber.from('100' + Util.eighteenZeros)
    const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)

    const creator = signers[0]
    const seeder = signers[1] // seeder is not creator
    const deployer = signers[2] // deployer is not creator
    const hodler1 = signers[3]

    const successLevel = redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit)

    const raiseDuration = 50

    const trustFactory2 = new ethers.ContractFactory(trustFactory.interface, trustFactory.bytecode, deployer)

    // bad weight ratio = initialValuation1 / totalTokenSupply1 >= 50
    assert(initialValuation1.div(totalTokenSupply1).gte(50), "wrong intended spot price for max weight test")

    Util.assertError(
      async () => await trustFactory2.deploy(
        {
          creator: creator.address,
          minCreatorRaise,
          seeder: seeder.address,
          seederFee,
          raiseDuration,
        },
        {
          name: tokenName,
          symbol: tokenSymbol,
          prestige: prestige.address,
          minimumStatus,
          totalSupply: totalTokenSupply1,
        },
        {
          crpFactory: crpFactory.address,
          balancerFactory: bFactory.address,
          reserve: reserve.address,
          reserveInit,
          initialValuation: initialValuation1,
          finalValuation: successLevel,
        },
        redeemInit,
      ),
      "revert ERR_MAX_WEIGHT",
      "wrongly deployed trust with pool at 50:1 weight ratio"
    )

    // bad weight ratio = initialValuation2 / totalTokenSupply2 < 1
    
    // Util.assertError(
    //   async () => await trustFactory2.deploy(
    //     {
    //       creator: creator.address,
    //       minCreatorRaise,
    //       seeder: seeder.address,
    //       seederFee,
    //       raiseDuration,
    //     },
    //     {
    //       name: tokenName,
    //       symbol: tokenSymbol,
    //       prestige: prestige.address,
    //       minimumStatus,
    //       totalSupply: totalTokenSupply2,
    //     },
    //     {
    //       crpFactory: crpFactory.address,
    //       balancerFactory: bFactory.address,
    //       reserve: reserve.address,
    //       reserveInit,
    //       initialValuation: initialValuation2,
    //       finalValuation: successLevel,
    //     },
    //     redeemInit,
    //   ),
    //   "revert ERR_MIN_WEIGHT",
    //   "wrongly deployed trust with pool at 1:1 weight ratio"
    // )

    // Ratio = initialValuation2 / totalTokenSupply1 = 5
    assert(initialValuation2.div(totalTokenSupply1).eq(5), 'wrong spot price for a valid pool')

    const trust = await trustFactory2.deploy(
      {
        creator: creator.address,
        minCreatorRaise,
        seeder: seeder.address,
        seederFee,
        raiseDuration,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        prestige: prestige.address,
        minimumStatus,
        totalSupply: totalTokenSupply1,
      },
      {
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit,
        initialValuation: initialValuation2,
        finalValuation: successLevel,
      },
      redeemInit,
    )
    
    await trust.deployed()

    const pool = new ethers.Contract(await trust.pool(), poolJson.abi, creator)

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder.address, reserveInit)

    const reserveSeeder = new ethers.Contract(reserve.address, reserve.interface, seeder)
    
    // seeder must approve before pool init
    await reserveSeeder.approve(await trust.pool(), reserveInit)
    
    await trust.startRaise({ gasLimit: 100000000 })

    const token = new ethers.Contract(await trust.token(), redeemableTokenJson.abi, creator)
    const bPool1 = new ethers.Contract(await pool.pool(), bPoolJson.abi, hodler1)
    const reserve1 = new ethers.Contract(reserve.address, reserve.interface, hodler1)
    const crp1 = new ethers.Contract(
      (await pool.crp()),
      crpJson.abi,
      hodler1
    )

    const startBlock = await ethers.provider.getBlockNumber()

    // hodler 1 needs some reserve
    await reserve.transfer(hodler1.address, ethers.BigNumber.from('100000' + Util.eighteenZeros))

    const spend = ethers.BigNumber.from('1' + Util.eighteenZeros)

    // do some swaps
    while ((await ethers.provider.getBlockNumber()) < (startBlock + raiseDuration - 1)) {
      await crp1.pokeWeights()
      await reserve1.approve(bPool1.address, spend)
      await bPool1.swapExactAmountIn(
        reserve.address,
        spend,
        token.address,
        ethers.BigNumber.from('1'),
        ethers.BigNumber.from('1000000' + Util.eighteenZeros)
      )
    }
  })
});
