import { ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import type { Trust } from "../typechain/Trust"
import type { ReserveToken } from "../typechain/ReserveToken"
import * as Util from './Util'

chai.use(solidity);
const { expect, assert } = chai;

// const tokenJson = require ('../artifacts/contracts/TrustToken.sol/TrustToken.json')

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

    const reserveTotal = ethers.BigNumber.from('1000' + Util.eighteenZeros)
    const mintRatio = ethers.BigNumber.from('3' + Util.eighteenZeros)
    const bookRatio = ethers.BigNumber.from('2' + Util.eighteenZeros)

    const trust = await trustFactory.deploy(
      crpFactory.address,
      bFactory.address,
      tokenName,
      tokenSymbol,
      reserve.address,
      reserveTotal,
      mintRatio,
      bookRatio
    )

    await trust.deployed()

    await reserve.approve(trust.address, reserveTotal)

    const now = await ethers.provider.getBlockNumber()
    const unlockBlock = now + 10

    await trust.init(unlockBlock, {
      gasLimit: 100000000
    })

  })
});
