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

const trustJson = require('../artifacts/contracts/Trust.sol/Trust.json')
const poolJson = require('../artifacts/contracts/RedeemableERC20Pool.sol/RedeemableERC20Pool.json')
const bPoolJson = require('../artifacts/contracts/configurable-rights-pool/contracts/test/BPool.sol/BPool.json')
const reserveJson = require('../artifacts/contracts/test/ReserveToken.sol/ReserveToken.json')
const redeemableTokenJson = require('../artifacts/contracts/RedeemableERC20.sol/RedeemableERC20.json')
const crpJson = require('../artifacts/contracts/configurable-rights-pool/contracts/ConfigurableRightsPool.sol/ConfigurableRightsPool.json')

describe("TrustSeed", async function () {
  it('should allow unseeding only after unseed delay period', async function () {
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
    const unseedDelay = 5
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

    // seeders needs some cash, give enough each for seeding
    await reserve.transfer(seeder1.address, seedPrice.mul(seeder1Units))
    await reserve.transfer(seeder2.address, seedPrice.mul(1))

    const seederContract1 = seederContract.connect(seeder1)
    const seederContract2 = seederContract.connect(seeder2)
    const reserve1 = reserve.connect(seeder1)
    const reserve2 = reserve.connect(seeder2)

    await reserve1.approve(seederContract.address, seedPrice.mul(seeder1Units))
    await reserve2.approve(seederContract.address, seedPrice.mul(1))

    // seeder1 sends reserve to seeder contract
    await seederContract1.seed(seeder1Units)
    const seed1Block = await ethers.provider.getBlockNumber()
    const delay1UnlockBlock = seed1Block + unseedDelay

    let seed2Block
    let delay2UnlockBlock

    // make blocks until delay period over
    for (let i = 0; delay1UnlockBlock > await ethers.provider.getBlockNumber() + 1; i++) {
      await Util.assertError(
        async () => await seederContract1.unseed(1),
        "revert ERR_UNSEED_LOCKED",
        `seeder1 unseeded before their delay period ended
        lastBlock   ${await ethers.provider.getBlockNumber()}
        unlockBlock ${delay1UnlockBlock}`
      )

      if (i === 1) {
        // seeder2 sends 1 unit to seeder contract
        await seederContract2.seed(1)
        console.log('seeder2 seeded contract');

        seed2Block = await ethers.provider.getBlockNumber()
        delay2UnlockBlock = seed2Block + unseedDelay
      } else {
        // create a block
        await reserve.transfer(signers[9].address, 0)
      }
    }

    // now seeder1 can unseed
    await seederContract1.unseed(seeder1Units)

    // unseed delay should be on a per-seeder basis
    for (let i = 0; delay2UnlockBlock > await ethers.provider.getBlockNumber() + 1; i++) {
      await Util.assertError(
        async () => await seederContract2.unseed(1),
        "revert ERR_UNSEED_LOCKED",
        `seeder2 unseeded before their delay period ended
        lastBlock   ${await ethers.provider.getBlockNumber()}
        unlockBlock ${delay2UnlockBlock}`
      )
      await reserve.transfer(signers[9].address, 0)
    }

    // now seeder2 can unseed
    await seederContract2.unseed(1)
  })

  it('should initialize with non-zero recipient', async function () {
    this.timeout(0)

    const signers = await ethers.getSigners()

    const reserve = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

    const seedFactory = await ethers.getContractFactory(
      'SeedERC20'
    )

    const reserveInit = ethers.BigNumber.from('2000' + Util.eighteenZeros)

    const seeder1 = signers[2]

    const seedUnits = 10
    const unseedDelay = 0
    const seedPrice = reserveInit.div(10)

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

    await Util.assertError(
      async () => await seederContract.init(ethers.constants.AddressZero),
      "revert ERR_RECIPIENT_ZERO",
      "seeder contract was initialized with zero address recipient"
    )

    // functions other than 'init' cannot be called until successful init
    await Util.assertError(
      async () => await seederContract.seed(1),
      "revert ERR_ONLY_INIT",
      "non-init function called before init"
    )
    await Util.assertError(
      async () => await seederContract.unseed(1),
      "revert ERR_ONLY_INIT",
      "non-init function called before init"
    )
    await Util.assertError(
      async () => await seederContract.redeem(1),
      "revert ERR_ONLY_INIT",
      "non-init function called before init"
    )

    await seederContract.init(signers[4].address) // some recipient


    await Util.assertError(
      async () => await seederContract.init(signers[5].address),
      "revert ERR_ONLY_NOT_INIT",
      "init was called twice"
    )

    // fetch recipient
    assert((await seederContract.recipient()) === signers[4].address, "wrong recipient")
  })

  it('should mint correct number of seed units on construction', async function () {
    this.timeout(0)

    const signers = await ethers.getSigners()

    const reserve = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

    const seedFactory = await ethers.getContractFactory(
      'SeedERC20'
    )

    const reserveInit = ethers.BigNumber.from('2000' + Util.eighteenZeros)

    const seeder1 = signers[2]

    const seedUnits = 10
    const unseedDelay = 0
    const seedPrice = reserveInit.div(10)

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

    assert((await seederContract.totalSupply()).eq(seedUnits), 'incorrect number of seed units minted on construction')
  })

  describe('should revert if parameters set to 0', async function () {
    it('seedUnits set to 0', async function () {
      this.timeout(0)

      const signers = await ethers.getSigners()

      const reserve = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

      const seedFactory = await ethers.getContractFactory(
        'SeedERC20'
      )

      const reserveInit = ethers.BigNumber.from('2000' + Util.eighteenZeros)

      const seeder1 = signers[2]

      const seedUnits = 0
      const unseedDelay = 0
      const seedPrice = reserveInit.div(10)

      // seeder1 creates seeder contract
      const seederFactory = new ethers.ContractFactory(seedFactory.interface, seedFactory.bytecode, seeder1)

      await Util.assertError(
        async () => await seederFactory.deploy({
          reserve: reserve.address,
          seedPrice,
          seedUnits,
          unseedDelay,
          name: "seed",
          symbol: "SD"
        }) as SeedERC20,
        "revert ERR_ZERO_UNITS",
        "seeder contract was wrongly constructed with seedUnits set to 0"
      )
    })

    it('seedPrice set to 0', async function () {
      this.timeout(0)

      const signers = await ethers.getSigners()

      const reserve = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

      const seedFactory = await ethers.getContractFactory(
        'SeedERC20'
      )

      const seeder1 = signers[2]

      const seedUnits = 10
      const unseedDelay = 0
      const seedPrice = 0

      // seeder1 creates seeder contract
      const seederFactory = new ethers.ContractFactory(seedFactory.interface, seedFactory.bytecode, seeder1)

      await Util.assertError(
        async () => await seederFactory.deploy({
          reserve: reserve.address,
          seedPrice,
          seedUnits,
          unseedDelay,
          name: "seed",
          symbol: "SD"
        }) as SeedERC20,
        "revert ERR_ZERO_PRICE",
        "seeder contract was wrongly constructed with seedPrice set to 0"
      )
    })
  })

  it('should set unblock block when fully seeded', async function () {
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
    await seederContract2.seed(seeder2Units)

    assert((await seederContract.unblockBlock()).eq(await ethers.provider.getBlockNumber()), `unblock block wasn't set when fully seeded`)
  })

  it('should allow trust to build SeedERC20 on construction', async function () {
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
    const deployer = signers[1] // deployer is not creator

    const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)
    const seedUnits = 10
    const unseedDelay = 0
    const seedPrice = reserveInit.div(10)

    const successLevel = redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit)
    const finalValuation = successLevel

    const raiseDuration = 50

    const trustFactory1 = new ethers.ContractFactory(trustFactory.interface, trustFactory.bytecode, deployer)

    const trust = await trustFactory1.deploy(
      {
        creator: creator.address,
        minCreatorRaise,
        seeder: ethers.constants.AddressZero,
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
      {
        reserve: reserve.address,
        seedPrice,
        seedUnits,
        unseedDelay,
        name: "seed",
        symbol: "SD"
      },
      redeemInit,
    )

    await trust.deployed()
  })

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

      const recipient = await trust.pool()

      await seederContract.init(recipient)

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

      await Util.assertError(
        async () => await trust.startRaise({ gasLimit: 100000000 }),
        "revert ERC20: transfer amount exceeds balance",
        "raise begun with insufficient seed reserve"
      )

      await seederContract2.seed(seeder2Units)

      // seeder cannot unseed after all units seeded
      await Util.assertError(
        async () => await seederContract1.unseed(seeder1Units),
        "revert ERR_ONLY_BLOCKED",
        "seeder1 unseeded despite all units being seeded"
      )

      // Recipient gains infinite approval on reserve token withdrawals from seed contract
      const recipientAllowance = await reserve.allowance(seederContract.address, recipient)

      const max_uint256 = ethers.BigNumber.from('115792089237316195423570985008687907853269984665640564039457584007913129639935')

      assert(recipientAllowance.eq(max_uint256), `
        recipient doesn't have infinite approval
        allowance ${recipientAllowance}
      `)

      assert((await reserve.balanceOf(seederContract.address)).eq(reserveInit), `seeder contract has insufficient reserve
        required  ${reserveInit}
        actual    ${await reserve.balanceOf(seederContract.address)}
      `)

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

      // correct amount of units should have been redeemed
      assert((await seederContract.totalSupply()).eq(seeder2Units), "wrong total seeder units supply")

      const expectedReturn1 = reserveInit.add(seederFee).mul(seeder1Units).div(seedUnits)

      // correct amount of reserve should have been returned
      assert((await reserve.balanceOf(seeder1.address)).eq(expectedReturn1), `wrong reserve returned to seeder1 after redeeming
      expected  ${expectedReturn1}
      actual    ${await reserve.balanceOf(seeder1.address)}
      `)

      await seederContract2.redeem(seeder2Units)

      // correct amount of units should have been redeemed
      assert((await seederContract.totalSupply()).isZero(), "wrong total seeder units supply")

      const expectedReturn2 = reserveInit.add(seederFee).mul(seeder2Units).div(seedUnits)

      // correct amount of reserve should have been returned
      assert((await reserve.balanceOf(seeder2.address)).eq(expectedReturn2), `wrong reserve returned to seeder2 after redeeming
      expected  ${expectedReturn2}
      actual    ${await reserve.balanceOf(seeder2.address)}
      `)

      // fails if not enough reserve balance
      await Util.assertError(
        async () => await seederContract1.redeem(seeder1Units),
        "revert ERR_RESERVE_BALANCE",
        "seeder1 redeemed when there wasn't enough reserve balance"
      )
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
      const seedPrice = reserveInit.div(seedUnits)

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

      await Util.assertError(
        async () => await trust.startRaise({ gasLimit: 100000000 }),
        "revert ERC20: transfer amount exceeds balance",
        "raise begun with insufficient seed reserve"
      )

      // redeem fails before seeding is complete
      await Util.assertError(
        async () => await seederContract1.redeem(seeder1Units),
        "revert ERR_ONLY_UNBLOCKED",
        "redeemed before seeding is complete"
      )

      await seederContract2.seed(seeder2Units)

      assert((await reserve.balanceOf(seederContract.address)).eq(reserveInit), `seeder contract has insufficient reserve
        required  ${reserveInit}
        actual    ${await reserve.balanceOf(seederContract.address)}
      `)

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

      // correct amount of units should have been redeemed
      assert((await seederContract.totalSupply()).eq(seeder2Units), "wrong total seeder units supply")

      const expectedReturn1 = trustFinalBalance.mul(seeder1Units).div(seedUnits)

      // correct amount of reserve should have been returned
      assert((await reserve.balanceOf(seeder1.address)).eq(expectedReturn1), `wrong reserve returned to seeder1 after redeeming
      expected  ${expectedReturn1}
      actual    ${await reserve.balanceOf(seeder1.address)}
      `)

      await seederContract2.redeem(seeder2Units)

      // correct amount of units should have been redeemed
      assert((await seederContract.totalSupply()).isZero(), "wrong total seeder units supply")

      const expectedReturn2 = trustFinalBalance.mul(seeder2Units).div(seedUnits).add(1)

      // correct amount of reserve should have been returned
      assert((await reserve.balanceOf(seeder2.address)).eq(expectedReturn2), `wrong reserve returned to seeder2 after redeeming
      expected  ${expectedReturn2}
      actual    ${await reserve.balanceOf(seeder2.address)}
      `)

      // fails if not enough reserve balance
      await Util.assertError(
        async () => await seederContract1.redeem(seeder1Units),
        "revert ERR_RESERVE_BALANCE",
        "seeder1 redeemed when there wasn't enough reserve balance"
      )
    })
  })
})