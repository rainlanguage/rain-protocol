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
  NIL,
  COPPER,
  BRONZE,
  SILVER,
  GOLD,
  PLATINUM,
  DIAMOND,
  CHAD,
  JAWAD,
}

describe("TrustRewards", async function () {
  it('should provide function to get list of redeemables on token in single call', async function () {
    this.timeout(0)

    const signers = await ethers.getSigners()

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy()

    const reserveA = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken
    const reserveB = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken
    const reserveC = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

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

    const reserveInit = ethers.BigNumber.from('2000' + Util.eighteenZeros)
    const redeemInit = ethers.BigNumber.from('2000' + Util.eighteenZeros)
    const totalTokenSupply = ethers.BigNumber.from('2000' + Util.eighteenZeros)
    const initialValuation = ethers.BigNumber.from('20000' + Util.eighteenZeros)
    const minCreatorRaise = ethers.BigNumber.from('100' + Util.eighteenZeros)

    const creator = signers[0]
    const seeder = signers[1] // seeder is not creator/owner
    const deployer = signers[2] // deployer is not creator

    const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)
    const seederUnits = 0;
    const unseedDelay = 0;

    const successLevel = redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit)

    const raiseDuration = 50

    const trustFactory1 = new ethers.ContractFactory(trustFactory.interface, trustFactory.bytecode, deployer)

    const trust = await trustFactory1.deploy(
      {
        creator: creator.address,
        minCreatorRaise,
        seeder: seeder.address,
        seederFee,
        seederUnits,
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
        reserve: reserveA.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      },
      redeemInit,
    )

    await trust.deployed()

    const token = new ethers.Contract(await trust.token(), redeemableTokenJson.abi, creator)

    await trust.connect(creator).creatorAddRedeemable(reserveB.address)

    const redeemables1 = await token.getRedeemables()
    assert(redeemables1[0] === reserveA.address, "wrong redeemable in token redeemables list")
    assert(redeemables1[1] === reserveB.address, "wrong redeemable in token redeemables list")

    await trust.connect(creator).creatorAddRedeemable(reserveC.address)

    const redeemables2 = await token.getRedeemables()
    assert(redeemables2[0] === reserveA.address, "wrong redeemable in token redeemables list")
    assert(redeemables2[1] === reserveB.address, "wrong redeemable in token redeemables list")
    assert(redeemables2[2] === reserveC.address, "wrong redeemable in token redeemables list")
  })

  it('should allow redemption only after token unblocked', async function () {
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

    const reserveInit = ethers.BigNumber.from('2000' + Util.eighteenZeros)
    const redeemInit = ethers.BigNumber.from('2000' + Util.eighteenZeros)
    const initialValuation = ethers.BigNumber.from('10000' + Util.eighteenZeros)
    const totalTokenSupply = ethers.BigNumber.from('2000' + Util.eighteenZeros)

    const minCreatorRaise = ethers.BigNumber.from('100' + Util.eighteenZeros)
    const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)
    const seederUnits = 0;
    const unseedDelay = 0;

    const creator = signers[0]
    const seeder = signers[1] // seeder is not creator
    const deployer = signers[2] // deployer is not creator
    const hodler1 = signers[3]

    const successLevel = redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit)
    const finalValuation = successLevel

    const raiseDuration = 50

    const trustFactoryDeployer = new ethers.ContractFactory(trustFactory.interface, trustFactory.bytecode, deployer)

    const trust = await trustFactoryDeployer.deploy(
      {
        creator: creator.address,
        minCreatorRaise,
        seeder: seeder.address,
        seederFee,
        seederUnits,
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

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder.address, reserveInit)

    const reserveSeeder = new ethers.Contract(reserve.address, reserve.interface, seeder)

    // seeder must transfer seed funds before pool init
    await reserveSeeder.transfer(await trust.pool(), reserveInit)

    await trust.startRaise({ gasLimit: 100000000 })

    const token = new ethers.Contract(await trust.token(), redeemableTokenJson.abi, creator)
    const pool = new ethers.Contract(await trust.pool(), poolJson.abi, creator)
    const bPool = new ethers.Contract(await pool.pool(), bPoolJson.abi, creator)
    const crp = new ethers.Contract(await pool.crp(), crpJson.abi, creator)

    assert((await token.unblockBlock()).isZero(), "token unblock block should not be set until endRaise")

    const startBlock = await ethers.provider.getBlockNumber()

    const reserveSpend = ethers.BigNumber.from('10' + Util.eighteenZeros)

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

    await swapReserveForTokens(hodler1, reserveSpend)

    const token1 = token.connect(hodler1)

    await Util.assertError(
      async () => await token1.redeem(await token1.balanceOf(hodler1.address)),
      "revert ERR_ONLY_UNBLOCKED",
      "hodler1 redeemed tokens before token unblocked (before pool unblock)"
    )

    // create empty transfer blocks until reaching pool unblock block, so raise can end
    while ((await ethers.provider.getBlockNumber()) < (startBlock + raiseDuration - 1)) {
      await reserve.transfer(signers[9].address, 0)
    }

    assert((await token.unblockBlock()).isZero(), "token unblock block should not be set until endRaise")

    const hodler1TokenBalanceBeforeRed = await token1.balanceOf(hodler1.address)

    await Util.assertError(
      async () => await token1.redeem(hodler1TokenBalanceBeforeRed),
      "revert ERR_ONLY_UNBLOCKED",
      `hodler1 redeemed tokens before token unblocked (after pool unblock)
      currentBlock      ${await ethers.provider.getBlockNumber()}
      tokenUnblockBlock ${await token.unblockBlock()}`
    )

    const hodler1TokenBalanceAfterRed = await token1.balanceOf(hodler1.address)

    assert(hodler1TokenBalanceBeforeRed.eq(hodler1TokenBalanceAfterRed), "tokens wrongly redeemed before redemption unblocked")

    const trust1 = trust.connect(hodler1)

    // after endRaise is called, token is unblocked
    await trust1.endRaise()

    assert((await token.unblockBlock()).eq((await ethers.provider.getBlockNumber())), `token unblock block should be set to current block
    currentBlock  ${await ethers.provider.getBlockNumber()}
    tokenUnblockBlock ${await token.unblockBlock()}`)

    await token1.redeem(await token1.balanceOf(hodler1.address))
  })

  it('should allow token owner to burn only their own tokens', async function () {
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

    const reserveInit = ethers.BigNumber.from('2000' + Util.eighteenZeros)
    const redeemInit = ethers.BigNumber.from('2000' + Util.eighteenZeros)
    const initialValuation = ethers.BigNumber.from('10000' + Util.eighteenZeros)
    const totalTokenSupply = ethers.BigNumber.from('2000' + Util.eighteenZeros)

    const minCreatorRaise = ethers.BigNumber.from('100' + Util.eighteenZeros)
    const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)
    const seederUnits = 0;
    const unseedDelay = 0;

    const creator = signers[0]
    const seeder = signers[1] // seeder is not creator
    const deployer = signers[2] // deployer is not creator
    const hodler1 = signers[3]
    const hodler2 = signers[4]

    const successLevel = redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit)
    const finalValuation = successLevel

    const raiseDuration = 50

    const trustFactoryDeployer = new ethers.ContractFactory(trustFactory.interface, trustFactory.bytecode, deployer)

    const trust = await trustFactoryDeployer.deploy(
      {
        creator: creator.address,
        minCreatorRaise,
        seeder: seeder.address,
        seederFee,
        seederUnits,
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

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder.address, reserveInit)

    const reserveSeeder = new ethers.Contract(reserve.address, reserve.interface, seeder)

    // seeder must transfer seed funds before pool init
    await reserveSeeder.transfer(await trust.pool(), reserveInit)

    await trust.startRaise({ gasLimit: 100000000 })

    const startBlock = await ethers.provider.getBlockNumber()

    const token = new ethers.Contract(await trust.token(), redeemableTokenJson.abi, creator)
    const pool = new ethers.Contract(await trust.pool(), poolJson.abi, creator)
    const bPool = new ethers.Contract(await pool.pool(), bPoolJson.abi, creator)
    const crp = new ethers.Contract(await pool.crp(), crpJson.abi, creator)

    const reserveSpend = ethers.BigNumber.from('10' + Util.eighteenZeros)

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

    await swapReserveForTokens(hodler1, reserveSpend)
    await swapReserveForTokens(hodler2, reserveSpend)

    const token1 = token.connect(hodler1)

    await token1.burn(await token1.balanceOf(hodler1.address))

    assert((await token.balanceOf(hodler1.address)).isZero(), "hodler1 failed to burn all of their own tokens")

    await Util.assertError(
      async () => await token1._burn(hodler2.address, await token1.balanceOf(hodler2.address)),
      "TypeError: token1._burn is not a function", // internal
      "hodler1 burned hodler2's tokens"
    )
  })

  it('should allow only creator to add new redeemables to the trust', async function () {
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

    const reserveInit = ethers.BigNumber.from('2000' + Util.eighteenZeros)
    const redeemInit = ethers.BigNumber.from('2000' + Util.eighteenZeros)
    const initialValuation = ethers.BigNumber.from('10000' + Util.eighteenZeros)
    const totalTokenSupply = ethers.BigNumber.from('2000' + Util.eighteenZeros)

    const minCreatorRaise = ethers.BigNumber.from('100' + Util.eighteenZeros)
    const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)
    const seederUnits = 0;
    const unseedDelay = 0;

    const creator = signers[0]
    const seeder = signers[1] // seeder is not creator
    const deployer = signers[2] // deployer is not creator
    const hodler1 = signers[3]

    const successLevel = redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit)
    const finalValuation = successLevel

    const raiseDuration = 50

    const trustFactoryDeployer = new ethers.ContractFactory(trustFactory.interface, trustFactory.bytecode, deployer)

    const trust = await trustFactoryDeployer.deploy(
      {
        creator: creator.address,
        minCreatorRaise,
        seeder: seeder.address,
        seederFee,
        seederUnits,
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

    const reserve2 = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken
    const reserve3 = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

    const trustCreator = trust.connect(creator)
    const trustDeployer = trust.connect(deployer)
    const trustHodler1 = trust.connect(hodler1)

    await Util.assertError(
      async () => await trustDeployer.creatorAddRedeemable(reserve2.address),
      'revert ERR_NOT_CREATOR',
      'trust deployer wrongly added new redeemable'
    )

    await trustCreator.creatorAddRedeemable(reserve2.address)

    await Util.assertError(
      async () => await trustHodler1.creatorAddRedeemable(reserve3.address),
      'revert ERR_NOT_CREATOR',
      'hodler wrongly added new redeemable'
    )
  })
});
