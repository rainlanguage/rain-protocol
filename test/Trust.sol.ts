import { ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import type { Trust } from "../typechain/Trust"
import type { ReserveToken } from "../typechain/ReserveToken"
import * as Util from './Util'

chai.use(solidity);
const { expect, assert } = chai;

describe("Trust", async function() {
  it("should create tokens", async function() {
    this.timeout(0)

    const signers = await ethers.getSigners()

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy()

    const reserve = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

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

    const reserveTotal = ethers.BigNumber.from('150000' + Util.eighteenZeros)
    const mintRatio = ethers.BigNumber.from('1' + Util.eighteenZeros)
    const bookRatio = ethers.BigNumber.from('2' + Util.eighteenZeros)
    const initialValuation = ethers.BigNumber.from('1000000' + Util.eighteenZeros)
    const minRaise = ethers.BigNumber.from('0')

    const trust = await trustFactory.deploy(
      crpFactory.address,
      bFactory.address,
      tokenName,
      tokenSymbol,
      reserve.address,
      reserveTotal,
      mintRatio,
      bookRatio,
      initialValuation,
      minRaise,
    )

    await trust.deployed()

    await reserve.approve(trust.address, reserveTotal)

    const now = await ethers.provider.getBlockNumber()
    const unblockBlock = now + 10

    await trust.init(unblockBlock, {
      gasLimit: 100000000
    })

    const poolFactory = await ethers.getContractFactory(
      'RedeemableERC20Pool',
      {
          libraries: {
              'RightsManager': rightsManager.address
          }
      }
    )

    // create a few blocks by sending some tokens around
    while ((await ethers.provider.getBlockNumber()) < (unblockBlock - 1)) {
      await reserve.transfer(signers[1].address, 1)
    }

    await trust.exit()

  })
});
