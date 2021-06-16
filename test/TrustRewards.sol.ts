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

enum RaiseStatus {
  PENDING,
  OPEN,
  SUCCESS,
  FAIL
}

describe("TrustRewards", async function () {
  it('should emit RedeemSuccess and RedeemFail events when redemptions occur', async function () {
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
    const totalTokenSupply = ethers.BigNumber.from('2000' + Util.eighteenZeros)
    const initialValuation = ethers.BigNumber.from('20000' + Util.eighteenZeros)
    const minCreatorRaise = ethers.BigNumber.from('100' + Util.eighteenZeros)

    const creator = signers[0]
    const seeder = signers[1] // seeder is not creator/owner
    const deployer = signers[2] // deployer is not creator
    const hodler1 = signers[3]
    const hodler2 = signers[4]

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
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
      },
      redeemInit,
    )

    await trust.deployed()

    // seeder needs some cash, give enough reserveA to seeder
    await reserve.transfer(seeder.address, reserveInit)

    const reserveSeeder = reserve.connect(seeder)

    // seeder must transfer funds to pool
    await reserveSeeder.transfer(await trust.pool(), reserveInit)

    await trust.startRaise({ gasLimit: 100000000 })

    const startBlock = await ethers.provider.getBlockNumber()

    const token = new ethers.Contract(await trust.token(), redeemableTokenJson.abi, creator)
    const pool = new ethers.Contract(await trust.pool(), poolJson.abi, creator)
    const bPool = new ethers.Contract(await pool.pool(), bPoolJson.abi, creator)
    const crp = new ethers.Contract(await pool.crp(), crpJson.abi, creator)

    // raise some funds
    const swapReserveForTokens = async (hodler, spend) => {
      // give hodler some reserve
      await reserve.transfer(hodler.address, spend)

      const reserveHodler = reserve.connect(hodler)
      const crpHodler = crp.connect(hodler)
      const bPoolHodler = bPool.connect(hodler)

      await crpHodler.pokeWeights()
      await reserveHodler.approve(bPool.address, spend)
      await bPoolHodler.swapExactAmountIn(
        reserve.address,
        spend,
        token.address,
        ethers.BigNumber.from('1'),
        ethers.BigNumber.from('1000000' + Util.eighteenZeros)
      )
    }

    const spend = ethers.BigNumber.from('1000' + Util.eighteenZeros)

    await swapReserveForTokens(hodler1, spend)
    await swapReserveForTokens(hodler1, spend)
    await swapReserveForTokens(hodler1, spend)

    let i = 0;
    while ((await ethers.provider.getBlockNumber() < startBlock + raiseDuration)) {
      await reserve.transfer(signers[9].address, 0)
      i++;
    }
    console.log(`created ${i} empty blocks`);

    await trust.endRaise()

    // should be successful raise
    assert(
      await trust.raiseStatus() === RaiseStatus.SUCCESS,
      "raise wasn't successful"
    )

    // freeze hodler1 to cause redeem to fail
    reserve.ownerAddFreezable(hodler1.address)

    // should fail because user is blacklisted/frozen by reserve
    await expect(token.connect(hodler1).redeem(1)) // fail to redeem just 1 token
      .to.emit(token, 'RedeemFail')
      .withArgs(hodler1.address, reserve.address)

    // unfreeze hodler1 to resume normal reserve behaviour
    reserve.ownerRemoveFreezable(hodler1.address)

    const hodler1TokenBalance = await token.balanceOf(hodler1.address)

    // should succeed when redeeming everything first time
    await expect(token.connect(hodler1).redeem(hodler1TokenBalance))
      .to.emit(token, 'RedeemSuccess')
      .withArgs(hodler1.address, reserve.address)

    // should revert when redeeming everything again since not enough to burn
    await Util.assertError(
      async () => await token.connect(hodler1).redeem(hodler1TokenBalance),
      "revert ERC20: burn amount exceeds balance",
      'redeemed tokens despite just redeeming entire balance'
    )
  })

  it('should calculate pro-rata correctly for token holders when using multiple reserve token types', async function () {
    this.timeout(0)

    const signers = await ethers.getSigners()

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy()

    const reserveA = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken
    const reserveB = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken
    const reserveC = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken
    const reserveD = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

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
    const hodler1 = signers[3]
    const hodler2 = signers[4]

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

    // seeder needs some cash, give enough reserveA to seeder
    await reserveA.transfer(seeder.address, reserveInit)

    const reserveSeeder = reserveA.connect(seeder)

    // seeder must transfer funds to pool
    await reserveSeeder.transfer(await trust.pool(), reserveInit)

    await trust.startRaise({ gasLimit: 100000000 })

    const startBlock = await ethers.provider.getBlockNumber()

    const token = new ethers.Contract(await trust.token(), redeemableTokenJson.abi, creator)
    const pool = new ethers.Contract(await trust.pool(), poolJson.abi, creator)
    const bPool = new ethers.Contract(await pool.pool(), bPoolJson.abi, creator)
    const crp = new ethers.Contract(await pool.crp(), crpJson.abi, creator)

    // raise some funds
    const swapReserveForTokens = async (hodler, spend, reserve) => {
      // give hodler some reserve
      await reserve.transfer(hodler.address, spend)

      const reserveHodler = reserve.connect(hodler)
      const crpHodler = crp.connect(hodler)
      const bPoolHodler = bPool.connect(hodler)

      await crpHodler.pokeWeights()
      await reserveHodler.approve(bPool.address, spend)
      await bPoolHodler.swapExactAmountIn(
        reserve.address,
        spend,
        token.address,
        ethers.BigNumber.from('1'),
        ethers.BigNumber.from('1000000' + Util.eighteenZeros)
      )
    }

    const spend = ethers.BigNumber.from('250' + Util.eighteenZeros)

    // trading/swaps occur with default reserve
    for (let i = 0; i < 11; i++) {
      await swapReserveForTokens(hodler1, spend, reserveA)
    }

    while ((await ethers.provider.getBlockNumber() < startBlock + raiseDuration)) {
      await reserveA.transfer(signers[9].address, 0)
    }

    const finalBalance = await reserveA.balanceOf(bPool.address)
    // on successful raise
    const seederPay = reserveInit.add(seederFee)
    const creatorPay = finalBalance.sub(seederPay.add(redeemInit))

    await trust.endRaise()

    // should be successful raise
    assert(
      await trust.raiseStatus() === RaiseStatus.SUCCESS,
      "raise wasn't successful"
    )

    // creator adds redeemables to token
    await trust.connect(creator).creatorAddRedeemable(reserveB.address)
    await trust.connect(creator).creatorAddRedeemable(reserveC.address)
    await trust.connect(creator).creatorAddRedeemable(reserveD.address)

    await reserveB.transfer(token.address, spend.mul(2))
    await reserveC.transfer(token.address, spend.mul(3))
    await reserveD.transfer(token.address, spend.mul(4))

    await Util.assertError(
      async () => await trust.connect(creator).creatorAddRedeemable(reserveA.address),
      "revert ERR_DUPLICATE_REDEEMABLE",
      "added duplicate redeemable"
    )

    const expectedRemainder = finalBalance.sub(creatorPay).sub(seederPay)

    const tokenReserveA = await reserveA.balanceOf(token.address)
    const tokenReserveB = await reserveB.balanceOf(token.address)
    const tokenReserveC = await reserveC.balanceOf(token.address)
    const tokenReserveD = await reserveD.balanceOf(token.address)

    assert(expectedRemainder.eq(tokenReserveA), `wrong reserveA remainder transferred to token
      expected  ${expectedRemainder}
      got       ${tokenReserveA}
    `)

    const totalSupply = await token.totalSupply()
    const hodler1TokenSupply = await token.balanceOf(hodler1.address)

    console.log(`total supply   ${totalSupply}`);
    console.log(`supply dust    ${totalSupply.mul(Util.ONE).div(1e7).div(Util.ONE)}`);
    console.log(`hodler1 supply ${hodler1TokenSupply}`);

    // hodler redeems some tokens
    await token.connect(hodler1).redeem(hodler1TokenSupply.div(10))

    // check hodler1 balance
    console.log(`
      hodler1 reserve balance
      reserveA  ${await reserveA.balanceOf(hodler1.address)}
      reserveB  ${await reserveB.balanceOf(hodler1.address)}
      reserveC  ${await reserveC.balanceOf(hodler1.address)}
      reserveD  ${await reserveD.balanceOf(hodler1.address)}
    `);
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
