import { ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import type { Trust } from "../typechain/Trust"
import type { ReserveToken } from "../typechain/ReserveToken"
import * as Util from './Util'

chai.use(solidity);
const { expect, assert } = chai;

const tokenJson = require ('../artifacts/contracts/TrustToken.sol/TrustToken.json')

describe("Trust", async function() {
  it("should create tokens", async function() {
    this.timeout(0)

    // const signers = await ethers.getSigners();

    // const reserve = await Util.basicDeploy("ReserveToken", {}) as ReserveToken

    // const trust = await Util.basicDeploy("Trust", {}) as Trust

    // const tokenDefinition = {
    //     initialSupply: 50,
    //     name: "token A",
    //     symbol: "TKNA",
    // }

    // const reserveDeposit = {
    //   reserveToken: reserve.address,
    //   lockedAmount: 10000,
    //   poolAmount: 25,
    // }
    // const normalizedApprovalAmount = ethers.BigNumber.from(
    //   (BigInt(reserveDeposit.lockedAmount) * BigInt(Math.pow(10, (await reserve.decimals())))).toString()
    // )
    // console.log(normalizedApprovalAmount)

    // const unlockBlock = 11833335 + 50

    // console.log(`Approving ${ethers.constants.MaxUint256} for ${trust.address} from ${signers[0].address}`)
    // await reserve["increaseAllowance(address,uint256)"](trust.address, ethers.constants.MaxUint256)

    // console.log((await reserve.allowance(signers[0].address, trust.address)).toString())

    // console.log('about to init')

    // await trust.init(tokenDefinition, reserveDeposit, unlockBlock, {
    //   gasLimit: ethers.BigNumber.from('100000000')
    // })

    // console.log('finished init')

    // const token = await trust.token()

    // const tokenContract = new ethers.Contract(token, tokenJson.abi, signers[0])

    // assert.equal("token A", await tokenContract.name())
    // assert.equal("TKNA", await tokenContract.symbol())
    // assert.equal(18, await tokenContract.decimals())
    // assert.equal(BigInt(50000000000000000000).toString(), (await tokenContract.totalSupply()).toString())
    // assert.equal(
    //   BigInt(50000000000000000000).toString(),
    //   (await tokenContract.balanceOf(trust.address)).toString()
    // )

  })
});
