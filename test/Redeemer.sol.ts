import * as Util from './Util'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { ReserveToken } from '../typechain/ReserveToken'
import type { TrustToken } from '../typechain/TrustToken'

chai.use(solidity)
const { expect, assert } = chai

describe("Redeemer", async function() {
    it("should lock tokens", async function() {
        this.timeout(0)

        const signers = await ethers.getSigners()

        const reserve = await Util.basicDeploy("ReserveToken", {}) as ReserveToken

        const tokenFactory = await ethers.getContractFactory(
            'TrustToken'
        )

        const tokenSupply = ethers.BigNumber.from('100000' + Util.eighteenZeros)
        const token = await tokenFactory.deploy(tokenSupply, 'Token', 'TKN') as TrustToken


    })
})