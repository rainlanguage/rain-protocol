import * as Util from './Util'
import chai from "chai";
import { solidity } from "ethereum-waffle";
import type { ReserveToken } from "../typechain/ReserveToken"
import type { TrustPool } from "../typechain/TrustPool"
import { ethers } from 'hardhat';

chai.use(solidity);
const { expect, assert } = chai;

describe("TrustPool", async function() {
    it("should create pool", async function() {
        this.timeout(0)

        const signers = await ethers.getSigners()

        const reserve = await Util.basicDeploy("ReserveToken", {}) as ReserveToken

        const trustPool = await Util.basicDeploy("TrustPool", {
            // Mainnet rights manager.
            "RightsManager": '0x0F811b1AF2B6B447B008eFF31eCceeE5A0b1d842'
        }) as TrustPool

        const tokenFactory = await ethers.getContractFactory(
            "TrustToken"
        )

        // Ten thousand to the 18
        const tokenSupply = ethers.BigNumber.from('10000' + Util.eighteenZeros)
        const token = await tokenFactory.deploy(tokenSupply, "Some token", "TKN")

        await token.deployed()

        // Send aaaalll the tokens to the trust pool
        // console.log(`Transfer from ${signers[0].address} to ${trustPool.address} for ${tokenSupply}`)
        await token.approve(trustPool.address, (await token.totalSupply()))
        // const allowance = await token.allowance(signers[0].address, trustPool.address)
        // console.log(allowance)
        // await token.transferFrom(signers[0].address, trustPool.address, (await token.totalSupply()))

        // One thousand to the 18
        const reserveSupply = ethers.BigNumber.from('1000' + Util.eighteenZeros)
        console.log(`Increase allowance by ${reserve.address} for ${trustPool.address} of ${reserveSupply}`)
        await reserve.approve(trustPool.address, reserveSupply)

        await trustPool.init(
            reserve.address,
            token.address,
            reserveSupply
        )

        const trustPoolCrpFactory = await trustPool.crp_factory()
        console.log(`Initialized crpFactory: ${trustPoolCrpFactory}`)

    })
})
