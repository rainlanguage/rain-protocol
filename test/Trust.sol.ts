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

describe("Trust", async function() {
  it('should allow third party to deploy trust, independently of creator and seeder', async function () {
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
    const creator = signers[0].address
    const seeder = signers[1].address // seeder is not creator/owner
    const deployer = signers[2] // deployer is not creator
    const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)

    const successLevel = redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit)

    const raiseDuration = 50

    const trustFactory1 = new ethers.ContractFactory(trustFactory.interface, trustFactory.bytecode, deployer)

    const trust = await trustFactory1.deploy(
      {
        creator,
        minCreatorRaise,
        seeder,
        seederFee,
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

    const trustConfig = await trust.trustConfig()
    const contractRedeemInit = await trust.redeemInit()

    assert(trustConfig.creator === creator, "wrong creator")
    assert(trustConfig.seeder === seeder, "wrong seeder")
    assert(trustConfig.minCreatorRaise.eq(minCreatorRaise), "wrong minimum raise amount")
    assert(trustConfig.seederFee.eq(seederFee), "wrong seeder fee")
    assert(trustConfig.raiseDuration.eq(raiseDuration), "wrong raise duration")
    assert(contractRedeemInit.eq(redeemInit), "wrong redeem init")
  })

  it('should unblock token only when raise end has been triggered', async function () {
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
    const creator = signers[0].address
    const seeder = signers[1].address // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)

    const successLevel = redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit)

    const raiseDuration = 50

    const trust = await trustFactory.deploy(
      {
        creator,
        minCreatorRaise: minCreatorRaise,
        seeder,
        seederFee,
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

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder, reserveInit)
    const seederStartingReserveBalance = await reserve.balanceOf(seeder)

    assert(seederStartingReserveBalance.eq(reserveInit), "wrong starting balance for seeder")

    const reserveSeeder = new ethers.Contract(reserve.address, reserve.interface, signers[1])
    
    // seeder must approve before pool init
    await reserveSeeder.approve(await trust.pool(), reserveInit)

    await trust.startRaise({ gasLimit: 100000000 })

    const startBlock = await ethers.provider.getBlockNumber()

    // create a few blocks by sending some tokens around
    while ((await ethers.provider.getBlockNumber()) < (startBlock + raiseDuration - 1)) {
      await reserve.transfer(signers[2].address, 1)
    }

    const token = new ethers.Contract(await trust.token(), redeemableTokenJson.abi, signers[0])
    const pool = new ethers.Contract(trust.pool(), poolJson.abi, signers[0])

    // pool unblock block should be set
    assert(
      (await pool.unblockBlock()).eq(startBlock + raiseDuration), 
      "pool unblock block was not set correctly"
    )

    // token unblock block should not be set yet
    // if it is, a user may accidentally redeem before raise ended, hence redeeming will return zero reserve to the user
    assert(
      (await token.unblockBlock()).isZero(), 
      "token unblock block was set before raise end"
    )
    
    await trust.endRaise()

    // token unblock block should now be set
    assert(
      (await token.unblockBlock()).eq(startBlock + raiseDuration), 
      "token unblock block wasn't set correctly during end raise"
    )
  })

  it("should allow anyone to start raise when seeder has approved with sufficient reserve liquidity", async function() {
    this.timeout(0)

    const signers = await ethers.getSigners()

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy()

    const reserve = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

    const prestigeFactory = await ethers.getContractFactory(
      'Prestige',
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

    const reserveInit = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const redeemInit = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const totalTokenSupply = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const initialValuation = ethers.BigNumber.from('1000000' + Util.eighteenZeros)
    const minCreatorRaise = ethers.BigNumber.from('100')
    const seeder = signers[1].address // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)

    const successLevel = redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit)

    const raiseDuration = 10

    const trust = await trustFactory.deploy(
      {
        creator: signers[0].address,
        minCreatorRaise: minCreatorRaise,
        seeder,
        seederFee,
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
    
    // seeder needs some cash, give some (0.5 billion USD) to seeder
    await reserve.transfer(seeder, (await reserve.balanceOf(signers[0].address)).div(2))

    const reserveSeeder = new ethers.Contract(reserve.address, reserve.interface, signers[1])

    // seeder approves insufficient reserve liquidity
    await reserveSeeder.approve(await trust.pool(), reserveInit.sub(1))

    // 'anyone'
    const trust2 = new ethers.Contract(trust.address, trustJson.abi, signers[2])

    Util.assertError(
      async () => await trust2.startRaise({ gasLimit: 100000000 }),
      "revert ERC20: transfer amount exceeds allowance",
      "raise wrongly started by someone with insufficent seed reserve liquidity"
    )

    // seeder approves sufficient reserve liquidity
    await reserveSeeder.approve(await trust.pool(), reserveInit)

    await trust2.startRaise({ gasLimit: 100000000 })
  })

  it("should only allow endRaise to succeed after pool unblock block", async function() {
    this.timeout(0)

    const signers = await ethers.getSigners()

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy()

    const reserve = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

    const prestigeFactory = await ethers.getContractFactory(
      'Prestige',
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

    const reserveInit = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const redeemInit = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const totalTokenSupply = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const initialValuation = ethers.BigNumber.from('1000000' + Util.eighteenZeros)
    const minCreatorRaise = ethers.BigNumber.from('100')
    const seeder = signers[1].address // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)

    const successLevel = redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit)

    const raiseDuration = 10

    const trust = await trustFactory.deploy(
      {
        creator: signers[0].address,
        minCreatorRaise: minCreatorRaise,
        seeder,
        seederFee,
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
    
    // seeder needs some cash, give some (0.5 billion USD) to seeder
    await reserve.transfer(seeder, (await reserve.balanceOf(signers[0].address)).div(2))

    const reserveSeeder = new ethers.Contract(reserve.address, reserve.interface, signers[1])
    await reserveSeeder.approve(await trust.pool(), reserveInit)

    await trust.startRaise({ gasLimit: 100000000 })

    // creator attempts to immediately end raise
    Util.assertError(
      async () => await trust.endRaise(),
      "revert ERR_ONLY_UNBLOCKED",
      "creator ended raise before pool unblock block"
    )

    const trust2 = new ethers.Contract(trust.address, trustJson.abi, signers[2])

    // other user attempts to immediately end raise
    Util.assertError(
      async () => await trust2.endRaise(),
      "revert ERR_ONLY_UNBLOCKED",
      "other user ended raise before pool unblock block"
    )
  })

  it("should configure prestige correctly", async function() {
    this.timeout(0)

    const signers = await ethers.getSigners()

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy()

    const reserve = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

    const prestigeFactory = await ethers.getContractFactory(
      'Prestige',
    )
    const prestige = await prestigeFactory.deploy() as Prestige
    const minimumStatus = Status.GOLD

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

    const reserveInit = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const redeemInit = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const totalTokenSupply = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const initialValuation = ethers.BigNumber.from('1000000' + Util.eighteenZeros)
    const minCreatorRaise = ethers.BigNumber.from('100')
    const seeder = signers[1].address // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)

    const successLevel = redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit)

    const raiseDuration = 10

    const trust = await trustFactory.deploy(
      {
        creator: signers[0].address,
        minCreatorRaise: minCreatorRaise,
        seeder,
        seederFee,
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
    
    const token = new ethers.Contract(await trust.token(), redeemableTokenJson.abi, signers[0])

    assert(
      (await token.minimumPrestigeStatus()) === minimumStatus,
      "wrong prestige level set on token"
    )
  })

  it("should mint the correct amount of tokens on construction", async function() {
    this.timeout(0)

    const signers = await ethers.getSigners()

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy()

    const reserve = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

    const prestigeFactory = await ethers.getContractFactory(
      'Prestige',
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

    const reserveInit = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const redeemInit = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const totalTokenSupply = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const initialValuation = ethers.BigNumber.from('1000000' + Util.eighteenZeros)
    const minCreatorRaise = ethers.BigNumber.from('100')
    const seeder = signers[1].address // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)

    const successLevel = redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit)

    const raiseDuration = 10

    const trust = await trustFactory.deploy(
      {
        creator: signers[0].address,
        minCreatorRaise: minCreatorRaise,
        seeder,
        seederFee,
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
    
    const token = new ethers.Contract(await trust.token(), redeemableTokenJson.abi, signers[0])

    assert(
      (await token.totalSupply()).eq(totalTokenSupply),
      "wrong amount of tokens minted"
    )
  })

  it("should set reserve asset as first redeemable asset on token construction", async function() {
    this.timeout(0)

    const signers = await ethers.getSigners()

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy()

    const reserve = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken
    const reserve2 = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

    const prestigeFactory = await ethers.getContractFactory(
      'Prestige',
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

    const reserveInit = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const redeemInit = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const totalTokenSupply = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const initialValuation = ethers.BigNumber.from('1000000' + Util.eighteenZeros)
    const minCreatorRaise = ethers.BigNumber.from('100')
    const seeder = signers[1].address // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)

    const successLevel = redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit)

    const raiseDuration = 10

    const trust = await trustFactory.deploy(
      {
        creator: signers[0].address,
        minCreatorRaise: minCreatorRaise,
        seeder,
        seederFee,
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
    
    const token = new ethers.Contract(await trust.token(), redeemableTokenJson.abi, signers[0])

    assert((await token.redeemables(0)) === reserve.address, 'reserve asset not set as first redeemable')
    
    await trust.creatorAddRedeemable(reserve2.address)
    
    assert((await token.redeemables(0)) === reserve.address, 'reserve asset no longer first redeemable, after adding 2nd redeemable')

    assert((await token.redeemables(1)) === reserve2.address, '2nd redeemable was not reserve 2 which was added after reserve 1')
  })

  it("should allow only token owner and creator to set redeemables", async function() {
    this.timeout(0)

    const signers = await ethers.getSigners()

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy()

    const reserve = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken
    const reserve2 = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken
    const reserve3 = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken
    const reserve4 = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken
    const reserve5 = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken
    const reserve6 = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken
    const reserve7 = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken
    const reserve8 = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken
    const reserve9 = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

    const prestigeFactory = await ethers.getContractFactory(
      'Prestige',
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

    const reserveInit = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const redeemInit = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const totalTokenSupply = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const initialValuation = ethers.BigNumber.from('1000000' + Util.eighteenZeros)
    const minCreatorRaise = ethers.BigNumber.from('100')
    const seeder = signers[1].address // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)

    const successLevel = redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit)

    const raiseDuration = 10

    const trust = await trustFactory.deploy(
      {
        creator: signers[0].address,
        minCreatorRaise: minCreatorRaise,
        seeder,
        seederFee,
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
    
    // creator can add redeemable via proxy method on trust contract
    await trust.creatorAddRedeemable(reserve2.address)
    
    const trust2 = new ethers.Contract(trust.address, trustJson.abi, signers[2])
    
    // non-creator cannot add redeemable
    Util.assertError(
      async () => await trust2.creatorAddRedeemable(reserve3.address),
      "revert ERR_NOT_CREATOR",
      "non-creator added redeemable"
    )

    // adding same redeemable should revert
    Util.assertError(
      async () => await trust.creatorAddRedeemable(reserve2.address),
      "revert ERR_DUPLICATE_REDEEMABLE",
      "added redeemable that was previously added"
    )

    // can add up to 8 redeemables
    await trust.creatorAddRedeemable(reserve3.address)
    await trust.creatorAddRedeemable(reserve4.address)
    await trust.creatorAddRedeemable(reserve5.address)
    await trust.creatorAddRedeemable(reserve6.address)
    await trust.creatorAddRedeemable(reserve7.address)
    await trust.creatorAddRedeemable(reserve8.address)

    Util.assertError(
      async () => await trust.creatorAddRedeemable(reserve9.address),
      "revert ERR_MAX_REDEEMABLES",
      "number of added redeemables exceeds limit of 8"
    )
  })

  it("should allow only token owner (Trust) to set unfreezables", async function() {
    this.timeout(0)

    const signers = await ethers.getSigners()

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy()

    const reserve = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

    const prestigeFactory = await ethers.getContractFactory(
      'Prestige',
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

    const reserveInit = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const redeemInit = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const totalTokenSupply = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const initialValuation = ethers.BigNumber.from('1000000' + Util.eighteenZeros)
    const minCreatorRaise = ethers.BigNumber.from('100')
    const seeder = signers[1].address // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)

    const successLevel = redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit)

    const raiseDuration = 10

    const trust = await trustFactory.deploy(
      {
        creator: signers[0].address,
        minCreatorRaise: minCreatorRaise,
        seeder,
        seederFee,
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

    const token = new ethers.Contract(await trust.token(), redeemableTokenJson.abi, signers[0])
    
    // token owner is correct
    assert((await token.owner()) === trust.address, 'token owner is not correct')

    // creator cannot add unfreezable
    Util.assertError(
      async () => await token.ownerAddUnfreezable(signers[3].address),
      "revert Ownable: caller is not the owner",
      "creator added unfreezable, despite not being token owner"
    )

    const token1 = new ethers.Contract(await trust.token(), redeemableTokenJson.abi, signers[2]) 

    // non-creator cannot add unfreezable, (no one but owner can add unfreezables)
    Util.assertError(
      async () => await token1.ownerAddUnfreezable(signers[3].address),
      "revert Ownable: caller is not the owner",
      "non-creator added unfreezable, despite not being token owner"
    )
    
    // creator cannot add unfreezable via some hypothetical proxy method on trust contract
    Util.assertError(
      async () => await trust.creatorAddUnfreezable(signers[3].address),
      "TypeError: trust.creatorAddUnfreezable is not a function",
      "creator added unfreezable via trust proxy method"
    )
  })

  it('should correctly calculate duration of pool, denominated in blocks from the block that seed funds are claimed', async function () {
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
    const seeder = signers[1].address // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)

    const successLevel = redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit)

    const raiseDuration = 10

    const trust = await trustFactory.deploy(
      {
        creator: signers[0].address,
        minCreatorRaise: minCreatorRaise,
        seeder,
        seederFee,
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

    // seeder needs some cash, give some (0.5 billion USD) to seeder
    await reserve.transfer(seeder, (await reserve.balanceOf(signers[0].address)).div(2))

    const reserveSeeder = new ethers.Contract(reserve.address, reserve.interface, signers[1])
    await reserveSeeder.approve(await trust.pool(), reserveInit)
    
    const blockBeforeRaiseSetup = await ethers.provider.getBlockNumber()
    const expectedUnblockBlock = blockBeforeRaiseSetup + raiseDuration;
    let blockCount = 0;

    await trust.startRaise({ gasLimit: 100000000 })

    const blockAfterRaiseSetup = await ethers.provider.getBlockNumber()
    const blocksDuringRaiseSetup = blockAfterRaiseSetup - blockBeforeRaiseSetup
    
    blockCount += blocksDuringRaiseSetup; // 1

    // move some blocks around
    while ((await ethers.provider.getBlockNumber()) !== expectedUnblockBlock) {
      await reserve.transfer(signers[2].address, 1)
      blockCount++
    }

    assert(raiseDuration === blockCount, `wrong raise duration, expected ${raiseDuration} got ${blockCount}`)
  })

  it('should not initialize without seeder', async function () {
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
    const seeder = signers[1].address // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)

    const successLevel = redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit)

    const raiseDuration = 10

    const trustPromise = trustFactory.deploy(
      {
        creator: signers[0].address,
        minCreatorRaise: minCreatorRaise,
        seederFee,
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

    Util.assertError(async () => await trustPromise, 'Error: invalid ENS name', 'initialized without seeder')
  })

  it('should transfer correct value to all stakeholders after successful raise', async function () {
    this.timeout(0)

    const signers = await ethers.getSigners()
    const hodler1 = signers[2]
    const hodler2 = signers[3]

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
    const creator = signers[0].address
    const seeder = signers[1].address // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)

    const successLevel = redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit)

    const raiseDuration = 50

    const trust = await trustFactory.deploy(
      {
        creator,
        minCreatorRaise: minCreatorRaise,
        seeder,
        seederFee,
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

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder, reserveInit)
    const seederStartingReserveBalance = await reserve.balanceOf(seeder)

    assert(seederStartingReserveBalance.eq(reserveInit), "wrong starting balance for seeder")

    const reserveSeeder = new ethers.Contract(reserve.address, reserve.interface, signers[1])
    
    // seeder must approve before pool init
    await reserveSeeder.approve(await trust.pool(), reserveInit)
    
    // give holders some reserve
    const spend1 = ethers.BigNumber.from('300' + Util.eighteenZeros)
    const spend2 = ethers.BigNumber.from('300' + Util.eighteenZeros)
    await reserve.transfer(hodler1.address, spend1.mul(10))
    await reserve.transfer(hodler2.address, spend2)

    await trust.startRaise({ gasLimit: 100000000 })
    
    const startBlock = await ethers.provider.getBlockNumber()

    const creatorStartingReserveBalance = await reserve.balanceOf(creator)

    // BEGIN: users hit the minimum raise

    const token = new ethers.Contract(await trust.token(), redeemableTokenJson.abi, signers[0])

    const trustPool = new ethers.Contract(
      (await trust.pool()),
      poolJson.abi,
      signers[0]
    )

    const bPool1 = new ethers.Contract(
      (await trustPool.pool()),
      bPoolJson.abi,
      hodler1
    )
    const reserve1 = new ethers.Contract(
      reserve.address,
      reserveJson.abi,
      hodler1
    )

    const crp1 = new ethers.Contract(
      (await trustPool.crp()),
      crpJson.abi,
      hodler1
    )

    let i = 0;
    while (i < 10) {
      await crp1.pokeWeights() // user pokes weights to get best deal for the current block
      await reserve1.approve(bPool1.address, spend1) // approves pool swap amount
      await bPool1.swapExactAmountIn(
        reserve.address,
        spend1,
        (await trust.token()),
        ethers.BigNumber.from('1'), // minimum out, otherwise revert
        ethers.BigNumber.from('1000000' + Util.eighteenZeros) // max price, otherwise revert
      )

      // ? do we need to check whether swap amounts are correct?

      i++
    }

    const hodler1TokenBalance = await token.balanceOf(hodler1.address)
    
    // hodler 1 transferred all reserve to token contract
    assert((await reserve.balanceOf(hodler1.address)).eq(0), "balancer pool not swapping correct spend1 amount in")

    const crp2 = new ethers.Contract(
      (await trustPool.crp()),
      crpJson.abi,
      hodler2
    )
    await crp2.pokeWeights()

    const bPool2 = new ethers.Contract(
      (await trustPool.pool()),
      bPoolJson.abi,
      hodler2
    )
    const reserve2 = new ethers.Contract(
      reserve.address,
      reserveJson.abi,
      hodler2
    )
    await reserve2.approve(
      bPool2.address,
      spend2
    )

    await bPool2.swapExactAmountIn(
      reserve.address,
      spend2,
      (await trust.token()),
      ethers.BigNumber.from('1'),
      ethers.BigNumber.from('1000000' + Util.eighteenZeros)
    )

    const hodler2TokenBalance = await token.balanceOf(hodler2.address)

    // hodler 2 transferred all reserve to token contract
    assert((await reserve.balanceOf(hodler2.address)).eq(0), "balancer pool not swapping correct spend2 amount in")

    // END: users hit the minimum raise
    
    let countTransfersToTriggerUnblock = 0;
    // create a few blocks by sending some tokens around
    while ((await ethers.provider.getBlockNumber()) < (startBlock + raiseDuration - 1)) {
      await reserve.transfer(signers[9].address, 1)
      countTransfersToTriggerUnblock++
    }

    const pool = new ethers.Contract(trust.pool(), poolJson.abi, signers[0])
    const bPool = new ethers.Contract((await pool.pool()), bPoolJson.abi, signers[0])

    const balancerPoolReserveBalance = await reserve.balanceOf(await bPool.address)   

    assert(!balancerPoolReserveBalance.eq(0), `got zero reserve balance for pool/trust ${await bPool.address}`)

    const seederReserveBalanceBeforeEndRaise = await reserve.balanceOf(seeder)

    const finalBalance = await reserve.balanceOf(bPool.address)
    const seederPay = reserveInit.add(seederFee)
    const tokenPay = redeemInit
    
    await trust.endRaise()

    // finalBalance * 10^-7 = 530000000000000
    const dust = ethers.BigNumber.from("530000000000000")

    const creatorEndingReserveBalance = await reserve.balanceOf(creator)

    // Creator has correct final balance

    // creatorPay = finalBalance - (seederPay + tokenPay)
    assert(
      creatorEndingReserveBalance
        .eq(
          creatorStartingReserveBalance
          .add(finalBalance)
          .sub(seederPay.add(tokenPay))
          .sub(dust)
          .sub(1) // dust rounding error
          .sub(countTransfersToTriggerUnblock) // creator loses some reserve when moving blocks
        ),
      `wrong reserve balance for creator after raise ended. 
      start ${creatorStartingReserveBalance} 
      end ${creatorEndingReserveBalance}
      finalBalance ${finalBalance}
      seederPay ${seederPay}
      tokenPay ${tokenPay}
      dust ${dust}
      dustRoundingError 1
      countTransfers ${countTransfersToTriggerUnblock}
      `
    )

    // creator has no tokens
    assert((await token.balanceOf(creator)).eq(0), "creator wrongly given tokens")
    
    // Seeder has correct final balance
    
    // on successful raise, seeder gets reserve init + seeder fee
    const seederEndExpected = seederReserveBalanceBeforeEndRaise.add(reserveInit).add(seederFee)
    const seederEndActual = await reserve.balanceOf(seeder)
    
    assert(
      (seederEndActual).eq(seederEndExpected),
      `wrong reserve amount transferred to seeder after successful raise ended. 
      Actual ${seederEndActual} 
      Expected ${seederEndExpected} 
      Difference ${seederEndActual.sub(seederEndExpected)}`
    )

    assert((await token.balanceOf(seeder)).eq(0), "seeder wrongly given tokens")

    // Token holders have correct final balance of reserve and tokens
    
    // correct reserve
    assert((await reserve.balanceOf(hodler1.address)).eq(0), "hodler 1 wrongly given reserve when raise ended")
    assert((await reserve.balanceOf(hodler2.address)).eq(0), "hodler 2 wrongly given reserve when raise ended")

    const hodler1EndingTokenBalance = await token.balanceOf(hodler1.address)
    const hodler2EndingTokenBalance = await token.balanceOf(hodler2.address)

    // Should remain unchanged from amounts during pool phase
    const hodler1ExpectedEndingTokenBalance = hodler1TokenBalance
    const hodler2ExpectedEndingTokenBalance = hodler2TokenBalance

    // correct tokens
    assert(hodler1EndingTokenBalance.eq(hodler1ExpectedEndingTokenBalance), "wrong final token balance for hodler 1")
    assert(hodler2EndingTokenBalance.eq(hodler2ExpectedEndingTokenBalance), "wrong final token balance for hodler 2")
  })

  it('should transfer correct value to all stakeholders after failed raise', async function () {
    this.timeout(0)

    const signers = await ethers.getSigners()
    const hodler1 = signers[2]
    const hodler2 = signers[3]

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
    const minCreatorRaise = ethers.BigNumber.from('10000' + Util.eighteenZeros)
    const creator = signers[0].address
    const seeder = signers[1].address // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)

    const successLevel = redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit)

    const raiseDuration = 50

    const trust = await trustFactory.deploy(
      {
        creator,
        minCreatorRaise: minCreatorRaise,
        seeder,
        seederFee,
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

    // seeder needs some cash, give enough to seeder
    await reserve.transfer(seeder, reserveInit)
    const seederStartingReserveBalance = await reserve.balanceOf(seeder)

    const reserveSeeder = new ethers.Contract(reserve.address, reserve.interface, signers[1])
    
    // seeder must approve before pool init
    await reserveSeeder.approve(await trust.pool(), reserveInit)

    // give holders some reserve (not enough for successful raise)
    const spend1 = ethers.BigNumber.from("300" + Util.eighteenZeros)
    const spend2 = ethers.BigNumber.from("300" + Util.eighteenZeros)
    await reserve.transfer(hodler1.address, spend1.mul(10))
    await reserve.transfer(hodler2.address, spend2)
    
    await trust.startRaise({ gasLimit: 100000000 })
    
    const startBlock = await ethers.provider.getBlockNumber()

    const creatorStartingReserveBalance = await reserve.balanceOf(creator)

    // BEGIN: users FAIL to hit the minimum raise

    const token = new ethers.Contract(await trust.token(), redeemableTokenJson.abi, signers[0])

    const trustPool = new ethers.Contract(
      (await trust.pool()),
      poolJson.abi,
      signers[0]
    )

    const bPool1 = new ethers.Contract(
      (await trustPool.pool()),
      bPoolJson.abi,
      hodler1
    )
    const reserve1 = new ethers.Contract(
      reserve.address,
      reserveJson.abi,
      hodler1
    )

    const crp1 = new ethers.Contract(
      (await trustPool.crp()),
      crpJson.abi,
      hodler1
    )

    let i = 0;
    while (i < 10) {
      await crp1.pokeWeights() // user pokes weights to get best deal for the current block
      await reserve1.approve(bPool1.address, spend1) // approves pool swap amount
      await bPool1.swapExactAmountIn(
        reserve.address,
        spend1,
        (await trust.token()),
        ethers.BigNumber.from('1'), // minimum out, otherwise revert
        ethers.BigNumber.from('1000000' + Util.eighteenZeros) // max price, otherwise revert
      )
      i++
    }

    const hodler1TokenBalance = await token.balanceOf(hodler1.address)
    
    // hodler 1 transferred all reserve to token contract
    assert((await reserve.balanceOf(hodler1.address)).eq(0), "balancer pool not swapping correct spend1 amount in")

    const crp2 = new ethers.Contract(
      (await trustPool.crp()),
      crpJson.abi,
      hodler2
    )
    await crp2.pokeWeights()

    const bPool2 = new ethers.Contract(
      (await trustPool.pool()),
      bPoolJson.abi,
      hodler2
    )
    const reserve2 = new ethers.Contract(
      reserve.address,
      reserveJson.abi,
      hodler2
    )
    await reserve2.approve(
      bPool2.address,
      spend2
    )

    await bPool2.swapExactAmountIn(
      reserve.address,
      spend2,
      (await trust.token()),
      ethers.BigNumber.from('1'),
      ethers.BigNumber.from('1000000' + Util.eighteenZeros)
    )

    const hodler2TokenBalance = await token.balanceOf(hodler2.address)

    // hodler 2 transferred all reserve to token contract
    assert((await reserve.balanceOf(hodler2.address)).eq(0), "balancer pool not swapping correct spend2 amount in")

    // END: users hit the minimum raise
    
    let countTransfersToTriggerUnblock = 0;
    // create a few blocks by sending some tokens around
    while ((await ethers.provider.getBlockNumber()) < (startBlock + raiseDuration - 1)) {
      await reserve.transfer(signers[9].address, 1)
      countTransfersToTriggerUnblock++
    }

    const pool = new ethers.Contract(trust.pool(), poolJson.abi, signers[0])
    const bPool = new ethers.Contract((await pool.pool()), bPoolJson.abi, signers[0])

    const finalBalance = await reserve.balanceOf(await bPool.address)

    // raise should fail 
    assert(finalBalance.lt(successLevel), `raise was successful
    final ${finalBalance}
    success ${successLevel}`)

    assert(!finalBalance.eq(0), `got zero final balance ${await bPool.address}`)
    
    await trust.endRaise()

    const creatorEndingReserveBalance = await reserve.balanceOf(creator)

    // Creator has correct final balance

    // on failed raise, creator gets nothing
    assert(creatorEndingReserveBalance.eq(creatorStartingReserveBalance.sub(countTransfersToTriggerUnblock)), 
      `creator balance changed after failed raise
      ending balance ${creatorEndingReserveBalance}
      starting balance ${creatorStartingReserveBalance}
      countTransfers ${countTransfersToTriggerUnblock}
      expectedBalance ${creatorStartingReserveBalance.sub(countTransfersToTriggerUnblock)}
    `)

    // Seeder has correct final balance

    // on failed raise, seeder gets reserveInit or final balance back, depending on whatever is smaller
    // in this case, reserve init is smaller
    assert(reserveInit.lt(finalBalance), "reserve init wasn't smaller than final balance")

    const seederEndExpected = seederStartingReserveBalance.sub(reserveInit).add(reserveInit)
    const seederEndActual = await reserve.balanceOf(seeder)

    assert(
      seederEndActual.eq(seederEndExpected),
      `wrong reserve amount transferred to seeder after failed raise ended ${seederEndActual} ${seederEndExpected}`
    )

    // Token holders have correct final balance of reserve and tokens

    // correct reserve
    assert((await reserve.balanceOf(hodler1.address)).eq(0), "hodler 1 wrongly given reserve when raise ended")
    assert((await reserve.balanceOf(hodler2.address)).eq(0), "hodler 2 wrongly given reserve when raise ended")

    const hodler1EndingTokenBalance = await token.balanceOf(hodler1.address)
    const hodler2EndingTokenBalance = await token.balanceOf(hodler2.address)

    // Should remain unchanged from amounts during pool phase
    const hodler1ExpectedEndingTokenBalance = hodler1TokenBalance
    const hodler2ExpectedEndingTokenBalance = hodler2TokenBalance

    // correct tokens
    assert(hodler1EndingTokenBalance.eq(hodler1ExpectedEndingTokenBalance), "wrong final token balance for hodler 1")
    assert(hodler2EndingTokenBalance.eq(hodler2ExpectedEndingTokenBalance), "wrong final token balance for hodler 2")

    // finalBalance * 10^-7 = 530000000000000
    const dust = ethers.BigNumber.from("530000000000000")

    // Token contract holds correct reserve balance
    const remainderReserveBalance = finalBalance.sub(reserveInit).sub(dust).sub(1)

    assert(
      (await reserve.balanceOf(token.address)).eq(remainderReserveBalance),
      "token contract did not receive remainder"
    )
  })

  it('should move all seeder funds to the pool', async function () {
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
    const seeder = signers[1].address // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)

    const successLevel = redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit)

    const raiseDuration = 10

    const trust = await trustFactory.deploy(
      {
        creator: signers[0].address,
        minCreatorRaise: minCreatorRaise,
        seeder,
        seederFee,
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

    // seeder needs some cash, give everything (1 billion USD) to seeder
    await reserve.transfer(seeder, await reserve.balanceOf(signers[0].address))

    const reserveSeeder = new ethers.Contract(reserve.address, reserve.interface, signers[1])

    const seederReserveBeforeStart = await reserve.balanceOf(seeder)
    
    Util.assertError(async () => 
      await trust.startRaise({ gasLimit: 100000000 }),
      "revert ERC20: transfer amount exceeds allowance",
      "initiated raise before seeder approved reserve token transfer"
    )
    
    // seeder must approve before pool init
    await reserveSeeder.approve(await trust.pool(), reserveInit)
    
    await trust.startRaise({ gasLimit: 100000000 })

    const seederReserveAfterStart = await reserve.balanceOf(seeder)

    assert(
      seederReserveBeforeStart.sub(seederReserveAfterStart).eq(reserveInit),
      `wrong reserve amount moved to pool ${seederReserveBeforeStart} ${seederReserveAfterStart}`
    )
  })

  it('should create a token and immediately send all supply to the pool', async function () {
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
    const seeder = signers[1].address // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)

    const successLevel = redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit)

    const raiseDuration = 10

    const trust = await trustFactory.deploy(
      {
        creator: signers[0].address,
        minCreatorRaise: minCreatorRaise,
        seeder,
        seederFee,
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

    const redeemableERC20 = new ethers.Contract(await trust.token(), redeemableTokenJson.abi, signers[0])

    assert((await redeemableERC20.balanceOf(trust.address)).eq(0))
    assert((await redeemableERC20.balanceOf(await trust.pool())).eq(totalTokenSupply))
  })

  it('should enforce final valuation greater than fundraise success', async function () {
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
    const seeder = signers[1].address // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)

    const successLevel = redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit)

    const raiseDuration = 10

    Util.assertError(
      async () => await trustFactory.deploy(
        {
          creator: signers[0].address,
          minCreatorRaise: minCreatorRaise,
          seeder,
          seederFee,
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
          finalValuation: successLevel.sub(1),
        },
        redeemInit,
      ),
      "revert ERR_MIN_FINAL_VALUATION",
      "did not enforce restriction that final valuation larger than success level"
    )
  })

  it('should enforce minted tokens to be greater than liquidity', async function () {
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
    const seeder = signers[1].address // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)

    const raiseDuration = 10

    Util.assertError(
      async () => await trustFactory.deploy(
        {
          creator: signers[0].address,
          minCreatorRaise: minCreatorRaise,
          seeder,
          seederFee,
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
          reserveInit: totalTokenSupply.add(1),
          initialValuation,
          finalValuation: redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit),
        },
        redeemInit,
      ),
      "revert ERR_MIN_TOKEN_SUPPLY",
      "did not enforce restriction that minted tokens be greater than liquidity"
    )
  })

  it('should enforce initial valuation to be higher than final valuation', async function () {
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
    const seeder = signers[1].address // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)

    const raiseDuration = 10

    Util.assertError(
      async () => await trustFactory.deploy(
        {
          creator: signers[0].address,
          minCreatorRaise: minCreatorRaise,
          seeder,
          seederFee,
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
          // finalValuation: redeemInit.add(minCreatorRaise).add(seederFee),
          finalValuation: initialValuation.add(1),
        },
        redeemInit,
      ),
      "revert ERR_MIN_INITIAL_VALUTION",
      "did not enforce valuation difference restriction (example 1)"
    )

    Util.assertError(
      async () => await trustFactory.deploy(
        {
          creator: signers[0].address,
          minCreatorRaise: minCreatorRaise,
          seeder,
          seederFee,
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
          initialValuation: redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit).sub(1),
          finalValuation: redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit),
        },
        redeemInit,
      ),
      "revert ERR_MIN_INITIAL_VALUTION",
      "did not enforce valuation difference restriction (example 2)"
    )
  })

  it('should be able to exit trust if creator does not end raise', async function () {
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
    const seeder = signers[1].address // seeder is not creator/owner
    const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)

    const raiseDuration = 10

    const trust = await trustFactory.deploy(
      {
        creator: signers[0].address,
        minCreatorRaise: minCreatorRaise,
        seeder,
        seederFee,
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
        finalValuation: redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit),
      },
      redeemInit,
    )

    await trust.deployed()

    // seeder needs some cash, give everything (1 billion USD) to seeder
    await reserve.transfer(signers[1].address, await reserve.balanceOf(signers[0].address))

    const reserveSeeder = new ethers.Contract(reserve.address, reserve.interface, signers[1])
    await reserveSeeder.approve(await trust.pool(), reserveInit)

    await trust.startRaise({
      gasLimit: 100000000
    })
    
    const startBlock = await ethers.provider.getBlockNumber()

    const trust2 = new ethers.Contract(trust.address, trust.interface, signers[2])
    // some other signer triggers trust to exit before unblock, should fail
    Util.assertError(
      async () => await trust2.endRaise(),
      "revert ERR_ONLY_UNBLOCKED",
      "trust exited before unblock"
    )

    // create a few blocks by sending some tokens around
    while ((await ethers.provider.getBlockNumber()) < (startBlock + raiseDuration - 1)) {
      await reserveSeeder.transfer(signers[1].address, 1)
    }

    // some other signer triggers trust to exit after unblock, should succeed
    await trust2.endRaise()

    // trust should no longer hold any reserve
    assert(
      (await reserve.balanceOf(trust.address)).eq(0), 
      "trust still holds non-zero reserve balance"
    )
  })

  it('should NOT refund successful raise', async function() {
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
    // @todo not a very interesting test
    const seeder = signers[0].address
    const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)

    const raiseDuration = 50

    const trust = await trustFactory.deploy(
      {
        creator: signers[0].address,
        minCreatorRaise: minCreatorRaise,
        seeder,
        seederFee,
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
        finalValuation: redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit),
      },
      redeemInit,
    )

    await trust.deployed()

    await reserve.approve(await trust.pool(), reserveInit)

    await trust.startRaise({
      gasLimit: 100000000
    })
    const startBlock = await ethers.provider.getBlockNumber()

    // users hit the minimum raise
    const spend1 = ethers.BigNumber.from('300' + Util.eighteenZeros)
    const spend2 = ethers.BigNumber.from('300' + Util.eighteenZeros)
    await reserve.transfer(signers[1].address, spend1.mul(10))
    await reserve.transfer(signers[2].address, spend2)

    const trustPool = new ethers.Contract(
      (await trust.pool()),
      poolJson.abi,
      signers[0]
    )

    const bPool1 = new ethers.Contract(
      (await trustPool.pool()),
      bPoolJson.abi,
      signers[1]
    )
    const reserve1 = new ethers.Contract(
      reserve.address,
      reserveJson.abi,
      signers[1]
    )

    const crp1 = new ethers.Contract(
      (await trustPool.crp()),
      crpJson.abi,
      signers[1]
      )

      let i = 0;
      while (i < 10) {
        await crp1.pokeWeights()
        await reserve1.approve(bPool1.address, spend1)
        await bPool1.swapExactAmountIn(
          reserve.address,
          spend1,
          (await trust.token()),
          ethers.BigNumber.from('1'),
          ethers.BigNumber.from('1000000' + Util.eighteenZeros)
        )
        i++
      }

    const crp2 = new ethers.Contract(
      (await trustPool.crp()),
      crpJson.abi,
      signers[2]
    )
    await crp2.pokeWeights()

    const bPool2 = new ethers.Contract(
      (await trustPool.pool()),
      bPoolJson.abi,
      signers[2]
    )
    const reserve2 = new ethers.Contract(
      reserve.address,
      reserveJson.abi,
      signers[2]
    )
    await reserve2.approve(
      bPool2.address,
      spend2
    )

    await bPool2.swapExactAmountIn(
      reserve.address,
      spend2,
      (await trust.token()),
      ethers.BigNumber.from('1'),
      ethers.BigNumber.from('1000000' + Util.eighteenZeros)
    )

    while ((await ethers.provider.getBlockNumber()) < (startBlock + raiseDuration - 1)) {
      await reserve.transfer(signers[1].address, 1)
    }

    const ownerBefore = await reserve.balanceOf(signers[0].address)
    await trust.endRaise()
    const ownerAfter = await reserve.balanceOf(signers[0].address)
    const ownerDiff = ownerAfter.sub(ownerBefore)

    assert(
      ethers.BigNumber.from('3299999469999999999999').eq(
        ownerDiff
      ),
      'wrong owner diff: ' + ownerDiff
    )

    const token1 = new ethers.Contract(
      (await trust.token()),
      redeemableTokenJson.abi,
      signers[1]
    )
    await token1.redeem(await token1.balanceOf(signers[1].address))
    const reserveBalance1 = await reserve.balanceOf(signers[1].address)
    assert(
      ethers.BigNumber.from('1829852661873618766014').eq(
        reserveBalance1
      ),
      'wrong balance 1 after redemption: ' + reserveBalance1
    )

    const token2 = new ethers.Contract(
      (await trust.token()),
      redeemableTokenJson.abi,
      signers[2]
    )
    await token2.redeem(await token2.balanceOf(signers[2].address))
    const reserveBalance2 = await reserve.balanceOf(signers[2].address)
    assert(
      ethers.BigNumber.from('170145949097001907750').eq(
        reserveBalance2
      ),
      'wrong balance 2 after redemption: ' + reserveBalance2
    )
  })

  it("should refund users", async function() {
    this.timeout(0)

    const signers = await ethers.getSigners()

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy()

    const reserve = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

    const prestigeFactory = await ethers.getContractFactory(
      'Prestige'
    )
    const prestige = await prestigeFactory.deploy() as Prestige
    const minimumStatus = Status.NIL

    const trustFactory = await ethers.getContractFactory (
      'Trust',
      {
        libraries: {
          'RightsManager': rightsManager.address
        }
      }
    )

    const tokenName = 'Token'
    const tokenSymbol = 'TKN'

    const reserveInit = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const redeemInit = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const totalTokenSupply = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const initialValuation = ethers.BigNumber.from('1000000' + Util.eighteenZeros)
    const minCreatorRaise = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const seeder = signers[0].address
    const seederFee = ethers.BigNumber.from('100' + Util.eighteenZeros)

    const raiseDuration = 15

    const trust = await trustFactory.deploy(
      {
        creator: signers[0].address,
        minCreatorRaise,
        seeder,
        seederFee,
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
        finalValuation: redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit),
      },
      redeemInit,
    )

    await trust.deployed()

    await reserve.approve(await trust.pool(), reserveInit)

    await trust.startRaise({
      gasLimit: 100000000
    })
    const startBlock = await ethers.provider.getBlockNumber()

    // have a few signers buy some tokens
    await reserve.transfer(signers[1].address, ethers.BigNumber.from('1000' + Util.eighteenZeros))
    await reserve.transfer(signers[2].address, ethers.BigNumber.from('2000' + Util.eighteenZeros))

    const trustPool = new ethers.Contract(
      (await trust.pool()),
      poolJson.abi,
      signers[0]
    )

    const bPool1 = new ethers.Contract(
      (await trustPool.pool()),
      bPoolJson.abi,
      signers[1]
    )
    const reserve1 = new ethers.Contract(
      reserve.address,
      reserveJson.abi,
      signers[1]
    )
    await reserve1.approve(bPool1.address, ethers.BigNumber.from('1000' + Util.eighteenZeros))

    await bPool1.swapExactAmountIn(
      reserve.address,
      ethers.BigNumber.from('1000' + Util.eighteenZeros),
      (await trust.token()),
      ethers.BigNumber.from('1'),
      ethers.BigNumber.from('1000000' + Util.eighteenZeros)
    )
    const crp2 = new ethers.Contract(
      (await trustPool.crp()),
      crpJson.abi,
      signers[2]
    )
    await crp2.pokeWeights()

    const bPool2 = new ethers.Contract(
      (await trustPool.pool()),
      bPoolJson.abi,
      signers[2]
    )
    const reserve2 = new ethers.Contract(
      reserve.address,
      reserveJson.abi,
      signers[2]
    )
    await reserve2.approve(
      bPool2.address,
      ethers.BigNumber.from('2000' + Util.eighteenZeros)
    )

    await bPool2.swapExactAmountIn(
      reserve.address,
      ethers.BigNumber.from('2000' + Util.eighteenZeros),
      (await trust.token()),
      ethers.BigNumber.from('1'),
      ethers.BigNumber.from('1000000' + Util.eighteenZeros)
    )

    // create a few blocks by sending some tokens around
    while ((await ethers.provider.getBlockNumber()) < (startBlock + raiseDuration - 1)) {
      await reserve.transfer(signers[1].address, 1)
    }

    await trust.endRaise()

    const token1 = new ethers.Contract(
      (await trust.token()),
      redeemableTokenJson.abi,
      signers[1]
    )
    await token1.redeem(await token1.balanceOf(signers[1].address))
    const reserveBalance1 = await reserve.balanceOf(signers[1].address)
    assert(
      ethers.BigNumber.from('841318037715972798048').eq(
        reserveBalance1
      ),
      'wrong balance 1 after redemption: ' + reserveBalance1
    )

    const token2 = new ethers.Contract(
      (await trust.token()),
      redeemableTokenJson.abi,
      signers[2]
    )
    await token2.redeem(await token1.balanceOf(signers[2].address))
    const reserveBalance2 = await reserve.balanceOf(signers[2].address)
    assert(
      ethers.BigNumber.from('2158587368352380585586').eq(
        reserveBalance2
      ),
      'wrong balance 2 after redemption: ' + reserveBalance2
    )
  })

  it("should create tokens", async function() {
    this.timeout(0)

    const signers = await ethers.getSigners()

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy()

    const reserve = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

    const prestigeFactory = await ethers.getContractFactory(
      'Prestige',
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

    const reserveInit = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const redeemInit = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const totalTokenSupply = ethers.BigNumber.from('100000' + Util.eighteenZeros)
    const initialValuation = ethers.BigNumber.from('1000000' + Util.eighteenZeros)
    const minCreatorRaise = ethers.BigNumber.from('0')
    const seeder = signers[0].address
    const seederFee = ethers.BigNumber.from('0')

    const raiseDuration = 10

    const trust = await trustFactory.deploy(
      {
        creator: signers[0].address,
        minCreatorRaise: minCreatorRaise,
        seeder,
        seederFee,
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
        finalValuation: redeemInit.add(minCreatorRaise).add(seederFee).add(reserveInit),
      },
      redeemInit,
    )

    await trust.deployed()

    await reserve.approve(await trust.pool(), reserveInit)

    await trust.startRaise({
      gasLimit: 100000000
    })
    const startBlock = await ethers.provider.getBlockNumber()

    // create a few blocks by sending some tokens around
    while ((await ethers.provider.getBlockNumber()) < (startBlock + raiseDuration - 1)) {
      await reserve.transfer(signers[1].address, 1)
    }

    await trust.endRaise()
  })
});
