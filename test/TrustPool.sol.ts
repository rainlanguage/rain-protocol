import * as Util from './Util'
import chai from "chai"
import { solidity } from "ethereum-waffle"
import type { ReserveToken } from "../typechain/ReserveToken"
// import type { TrustToken } from "../typechain/TrustToken"
import type { TrustPool } from "../typechain/TrustPool"
import { ethers } from 'hardhat'

chai.use(solidity);
const { expect, assert } = chai;

describe("TrustPool", async function() {
    it("should create pool", async function() {
        this.timeout(0)

        // const signers = await ethers.getSigners()

        // const reserve = await Util.basicDeploy("ReserveToken", {}) as ReserveToken

        // const tokenFactory = await ethers.getContractFactory(
        //     "TrustToken"
        // )

        // // Ten thousand to the 18
        // const tokenSupply = ethers.BigNumber.from('10000' + Util.eighteenZeros)
        // const token = await tokenFactory.deploy(tokenSupply, "Some token", "TKN") as TrustToken

        // await token.deployed()

        // // One thousand to the 18
        // const reserveSupply = ethers.BigNumber.from('1000' + Util.eighteenZeros)

        // const trustPoolFactory = await ethers.getContractFactory(
        //     "TrustPool",
        //     {
        //         libraries: {
        //             // Mainnet rights manager.
        //             "RightsManager": '0x0F811b1AF2B6B447B008eFF31eCceeE5A0b1d842'
        //         }
        //     }
        // )

        // const unlockBlock = 11833335 + 50

        // const trustPool = await trustPoolFactory.deploy(
        //     reserve.address,
        //     token.address,
        //     reserveSupply,
        //     unlockBlock
        // ) as TrustPool

        // await trustPool.deployed()

        // // Init will revert if these approvals are not exact.
        // await token.approve(trustPool.address, (await token.totalSupply()))
        // await reserve.approve(trustPool.address, reserveSupply)

        // await trustPool.init()

        // const trustPoolCrp = await trustPool.crp()
        // console.log(`Initialized crp: ${trustPoolCrp}`)

        // const trustPoolPool = await trustPool.pool()
        // console.log(`Initialized pool: ${trustPoolPool}`)

    })
})
