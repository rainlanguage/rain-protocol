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

const poolJson = require('../artifacts/contracts/RedeemableERC20Pool.sol/RedeemableERC20Pool.json')
const bPoolJson = require('../artifacts/contracts/configurable-rights-pool/contracts/test/BPool.sol/BPool.json')
const reserveJson = require('../artifacts/contracts/test/ReserveToken.sol/ReserveToken.json')
const redeemableTokenJson = require('../artifacts/contracts/RedeemableERC20.sol/RedeemableERC20.json')
const crpJson = require('../artifacts/contracts/configurable-rights-pool/contracts/ConfigurableRightsPool.sol/ConfigurableRightsPool.json')

describe("Trust", async function() {
  it('should be able to exit trust if creator does not end raise', async function () {
    this.timeout(0)

    const signers = await ethers.getSigners()

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy()

    const reserve = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

    const prestigeFactory = await ethers.getContractFactory(
      'Prestige'
    )
    const prestige = await prestigeFactory.deploy() as Prestige
    const minimumStatus = 0

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
    const seederUnits = 0
    const unseedDelay = 0

    const raiseDuration = 50

    const trust = await trustFactory.deploy(
      {
        creator: signers[0].address,
        minCreatorRaise: minCreatorRaise,
        seeder,
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
        finalValuation: redeemInit.add(minCreatorRaise).add(seederFee),
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
    const minimumStatus = 0

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
    const seederUnits = 0
    const unseedDelay = 0

    const raiseDuration = 50

    const trust = await trustFactory.deploy(
      {
        creator: signers[0].address,
        minCreatorRaise: minCreatorRaise,
        seeder,
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
        reserveInit: reserveInit,
        initialValuation: initialValuation,
        finalValuation: redeemInit.add(minCreatorRaise).add(seederFee),
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
      ethers.BigNumber.from('1814826792606639364014').eq(
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
      ethers.BigNumber.from('185171905433423190443').eq(
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
    const minimumStatus = 0

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
    const seederUnits = 0
    const unseedDelay = 0

    const raiseDuration = 15

    const trust = await trustFactory.deploy(
      {
        creator: signers[0].address,
        minCreatorRaise,
        seeder,
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
        reserveInit: reserveInit,
        initialValuation: initialValuation,
        finalValuation: redeemInit.add(minCreatorRaise).add(seederFee),
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
      ethers.BigNumber.from('814708998174540889153').eq(
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
      ethers.BigNumber.from('2185199083413823513466').eq(
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
    const minimumStatus = 0

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
    const seederUnits = 0
    const unseedDelay = 0

    const raiseDuration = 10

    const trust = await trustFactory.deploy(
      {
        creator: signers[0].address,
        minCreatorRaise,
        seeder,
        seederFee,
        seederUnits,
        unseedDelay,
        raiseDuration,
      },
      {
        name: tokenName,
        symbol: tokenSymbol,
        prestige: prestige.address,
        minimumStatus: minimumStatus,
        totalSupply: totalTokenSupply,
      },
      {
        crpFactory: crpFactory.address,
        balancerFactory: bFactory.address,
        reserve: reserve.address,
        reserveInit: reserveInit,
        initialValuation: initialValuation,
        finalValuation: redeemInit.add(minCreatorRaise).add(seederFee),
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
