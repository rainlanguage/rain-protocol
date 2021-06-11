import * as Util from './Util'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { ReserveToken } from '../typechain/ReserveToken'
import type { SeedERC20 } from '../typechain/SeedERC20'
import type { Prestige } from "../typechain/Prestige";

chai.use(solidity)
const { expect, assert } = chai

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

const trustJson = require('../artifacts/contracts/Trust.sol/Trust.json')
const poolJson = require('../artifacts/contracts/RedeemableERC20Pool.sol/RedeemableERC20Pool.json')
const bPoolJson = require('../artifacts/contracts/configurable-rights-pool/contracts/test/BPool.sol/BPool.json')
const reserveJson = require('../artifacts/contracts/test/ReserveToken.sol/ReserveToken.json')
const redeemableTokenJson = require('../artifacts/contracts/RedeemableERC20.sol/RedeemableERC20.json')
const crpJson = require('../artifacts/contracts/configurable-rights-pool/contracts/ConfigurableRightsPool.sol/ConfigurableRightsPool.json')

describe("TrustSeed", async function () {
  describe('should allow many seeders to seed trust', async function () {
    it('successful raise', async function () {
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

      const seedFactory = await ethers.getContractFactory(
        'SeedERC20'
      )

      const tokenName = 'Token'
      const tokenSymbol = 'TKN'

      const reserveInit = ethers.BigNumber.from('2000' + Util.eighteenZeros)
      const redeemInit = ethers.BigNumber.from('2000' + Util.eighteenZeros)
      const totalTokenSupply = ethers.BigNumber.from('2000' + Util.eighteenZeros)
      const initialValuation = ethers.BigNumber.from('20000' + Util.eighteenZeros)
      const minCreatorRaise = ethers.BigNumber.from('100' + Util.eighteenZeros)

      const creator = signers[0]
      const deployer = signers[1] // deployer is not creator
      const seeder1 = signers[2]
      const seeder2 = signers[3]
      const hodler1 = signers[4]

      const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)
      const seedUnits = 10
      const unseedDelay = 0
      const seedPrice = reserveInit.div(10)

      const successLevel = redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit)
      const finalValuation = successLevel

      const raiseDuration = 50

      // seeder1 creates seeder contract
      const seederFactory = new ethers.ContractFactory(seedFactory.interface, seedFactory.bytecode, seeder1)

      const seederContract = await seederFactory.deploy({
        reserve: reserve.address,
        seedPrice,
        seedUnits,
        unseedDelay,
        name: "seed",
        symbol: "SD"
      }) as SeedERC20

      await seederContract.deployed()

      const trustFactory1 = new ethers.ContractFactory(trustFactory.interface, trustFactory.bytecode, deployer)

      const trust = await trustFactory1.deploy(
        {
          creator: creator.address,
          minCreatorRaise,
          seeder: seederContract.address,
          seederFee,
          seederUnits: seedUnits,
          unseedDelay,
          raiseDuration,
        },
        {
          name: tokenName,
          symbol: tokenSymbol,
          prestige: prestige.address,
          minimumStatus,
          totalSupply: totalTokenSupply,
        },
        {
          crpFactory: crpFactory.address,
          balancerFactory: bFactory.address,
          reserve: reserve.address,
          reserveInit,
          initialValuation,
          finalValuation,
        },
        redeemInit,
      )

      await trust.deployed()

      await seederContract.init(await trust.pool())

      const seeder1Units = 4;
      const seeder2Units = 6;

      // seeders needs some cash, give enough each for seeding
      await reserve.transfer(seeder1.address, seedPrice.mul(seeder1Units))
      await reserve.transfer(seeder2.address, seedPrice.mul(seeder2Units))

      const seederContract1 = seederContract.connect(seeder1)
      const seederContract2 = seederContract.connect(seeder2)
      const reserve1 = reserve.connect(seeder1)
      const reserve2 = reserve.connect(seeder2)

      await reserve1.approve(seederContract.address, seedPrice.mul(seeder1Units))
      await reserve2.approve(seederContract.address, seedPrice.mul(seeder2Units))

      // seeders send reserve to seeder contract
      await seederContract1.seed(seeder1Units)

      assert(!(await seederContract1.seeded()), `should not be fully seeded yet`)

      Util.assertError(
        async () => await trust.startRaise({ gasLimit: 100000000 }),
        "revert ERC20: transfer amount exceeds balance",
        "raise begun with insufficient seed reserve"
      )

      await seederContract2.seed(seeder2Units)

      Util.assertError(
        async () => await seederContract1.unseed(seeder1Units),
        "revert ERR_SEEDED",
        "seeder retrieved funds despite contract being fully seeded"
      )

      assert((await reserve.balanceOf(seederContract.address)).eq(reserveInit), `seeder contract has insufficient reserve
        required  ${reserveInit}
        actual    ${await reserve.balanceOf(seederContract.address)}
      `)

      assert(await seederContract1.seeded(), `failed to set seeded`)

      await trust.startRaise({ gasLimit: 100000000 })

      const startBlock = await ethers.provider.getBlockNumber()

      assert((await reserve.balanceOf(seederContract.address)).isZero(), `seeder contract wrongly holding reserve after raise started`)

      const token = new ethers.Contract(await trust.token(), redeemableTokenJson.abi, creator)
      const pool = new ethers.Contract(await trust.pool(), poolJson.abi, creator)
      const bPool = new ethers.Contract(await pool.pool(), bPoolJson.abi, creator)
      const crp = new ethers.Contract(await pool.crp(), crpJson.abi, creator)

      const reserveSpend = finalValuation.div(10)

      // holder1 fully funds raise
      const swapReserveForTokens = async (hodler, spend) => {
        // give hodler some reserve
        await reserve.transfer(hodler.address, spend)

        const reserveHodler = reserve.connect(hodler)
        const crpHodler = crp.connect(hodler)
        const bPoolHodler = bPool.connect(hodler)

        await reserveHodler.approve(bPool.address, spend)
        await crpHodler.pokeWeights()
        await bPoolHodler.swapExactAmountIn(
          reserve.address,
          spend,
          token.address,
          ethers.BigNumber.from('1'),
          ethers.BigNumber.from('1000000' + Util.eighteenZeros)
        )
      }

      while ((await reserve.balanceOf(bPool.address)).lte(successLevel)) {
        await swapReserveForTokens(hodler1, reserveSpend)
      }

      // add blocks until raise can end
      while ((await ethers.provider.getBlockNumber()) < (startBlock + raiseDuration - 1)) {
        await reserve.transfer(signers[9].address, 0)
      }

      // on successful raise, seeder gets reserveInit + seederFee
      const expectedSeederPay = reserveInit.add(seederFee)

      // seeder1 ends raise
      await trust.connect(seeder1).endRaise()

      // seederContract should now hold reserve equal to final balance
      assert((await reserve.balanceOf(seederContract.address)).eq(expectedSeederPay), `seeder contract has wrong reserve amount after failed raise ended
      expected  ${expectedSeederPay}
      actual    ${await reserve.balanceOf(seederContract.address)}`)

      // seeders redeem funds
      await seederContract1.redeem(seeder1Units)
      await seederContract2.redeem(seeder2Units)
    })

    it('failed raise', async function () {
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

      const seedFactory = await ethers.getContractFactory(
        'SeedERC20'
      )

      const tokenName = 'Token'
      const tokenSymbol = 'TKN'

      const reserveInit = ethers.BigNumber.from('2000' + Util.eighteenZeros)
      const redeemInit = ethers.BigNumber.from('2000' + Util.eighteenZeros)
      const totalTokenSupply = ethers.BigNumber.from('2000' + Util.eighteenZeros)
      const initialValuation = ethers.BigNumber.from('20000' + Util.eighteenZeros)
      const minCreatorRaise = ethers.BigNumber.from('100' + Util.eighteenZeros)

      const creator = signers[0]
      const deployer = signers[1] // deployer is not creator
      const seeder1 = signers[2]
      const seeder2 = signers[3]

      const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)
      const seedUnits = 10
      const unseedDelay = 0
      const seedPrice = reserveInit.div(10)

      const successLevel = redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit)

      const raiseDuration = 50

      // seeder1 creates seeder contract
      const seederFactory = new ethers.ContractFactory(seedFactory.interface, seedFactory.bytecode, seeder1)

      const seederContract = await seederFactory.deploy({
        reserve: reserve.address,
        seedPrice,
        seedUnits,
        unseedDelay,
        name: "seed",
        symbol: "SD"
      }) as SeedERC20

      await seederContract.deployed()

      const trustFactory1 = new ethers.ContractFactory(trustFactory.interface, trustFactory.bytecode, deployer)

      const trust = await trustFactory1.deploy(
        {
          creator: creator.address,
          minCreatorRaise,
          seeder: seederContract.address,
          seederFee,
          seederUnits: seedUnits,
          unseedDelay,
          raiseDuration,
        },
        {
          name: tokenName,
          symbol: tokenSymbol,
          prestige: prestige.address,
          minimumStatus,
          totalSupply: totalTokenSupply,
        },
        {
          crpFactory: crpFactory.address,
          balancerFactory: bFactory.address,
          reserve: reserve.address,
          reserveInit,
          initialValuation,
          finalValuation: successLevel,
        },
        redeemInit,
      )

      await trust.deployed()

      await seederContract.init(await trust.pool())

      const seeder1Units = 4;
      const seeder2Units = 6;

      // seeders needs some cash, give enough each for seeding
      await reserve.transfer(seeder1.address, seedPrice.mul(seeder1Units))
      await reserve.transfer(seeder2.address, seedPrice.mul(seeder2Units))

      const seederContract1 = seederContract.connect(seeder1)
      const seederContract2 = seederContract.connect(seeder2)
      const reserve1 = reserve.connect(seeder1)
      const reserve2 = reserve.connect(seeder2)

      await reserve1.approve(seederContract.address, seedPrice.mul(seeder1Units))
      await reserve2.approve(seederContract.address, seedPrice.mul(seeder2Units))

      // seeders send reserve to seeder contract
      await seederContract1.seed(seeder1Units)

      assert(!(await seederContract1.seeded()), `should not be fully seeded yet`)

      Util.assertError(
        async () => await trust.startRaise({ gasLimit: 100000000 }),
        "revert ERC20: transfer amount exceeds balance",
        "raise begun with insufficient seed reserve"
      )

      await seederContract2.seed(seeder2Units)

      Util.assertError(
        async () => await seederContract1.unseed(seeder1Units),
        "revert ERR_SEEDED",
        "seeder retrieved funds despite contract being fully seeded"
      )

      assert((await reserve.balanceOf(seederContract.address)).eq(reserveInit), `seeder contract has insufficient reserve
        required  ${reserveInit}
        actual    ${await reserve.balanceOf(seederContract.address)}
      `)

      assert(await seederContract1.seeded(), `failed to set seeded`)

      await trust.startRaise({ gasLimit: 100000000 })

      const startBlock = await ethers.provider.getBlockNumber()

      assert((await reserve.balanceOf(seederContract.address)).isZero(), `seeder contract wrongly holding reserve after raise started`)

      // add blocks until failed raise
      while ((await ethers.provider.getBlockNumber()) < (startBlock + raiseDuration - 1)) {
        await reserve.transfer(signers[9].address, 0)
      }

      const pool = new ethers.Contract(await trust.pool(), poolJson.abi, creator)
      const bPoolAddress = await pool.pool()

      const bPoolFinalBalance = await reserve.balanceOf(bPoolAddress)
      const bPoolReserveDust = bPoolFinalBalance.mul(Util.ONE).div(1e7).div(Util.ONE)
        .add(1) // rounding error

      const trustFinalBalance = bPoolFinalBalance.sub(bPoolReserveDust)

      const expectedSeederPay = reserveInit.lte(trustFinalBalance) ? reserveInit : trustFinalBalance

      // seeder1 ends raise
      await trust.connect(seeder1).endRaise()

      // seederContract should now hold reserve equal to final balance
      assert((await reserve.balanceOf(seederContract.address)).eq(expectedSeederPay), `seeder contract has wrong reserve amount after failed raise ended
      expected  ${expectedSeederPay}
      actual    ${await reserve.balanceOf(seederContract.address)}`)

      // seeders redeem funds
      await seederContract1.redeem(seeder1Units)
      await seederContract2.redeem(seeder2Units)
    })
  })
})