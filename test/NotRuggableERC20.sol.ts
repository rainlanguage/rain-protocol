import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { NotRuggableERC20Test } from '../typechain/NotRuggableERC20Test'

chai.use(solidity)
const { expect, assert } = chai

describe('NotRuggableERC20', async function() {
    it('should not be multi mintable', async function() {
        this.timeout(0)

        const signers = await ethers.getSigners()

        const notRuggableFactory = await ethers.getContractFactory(
            'NotRuggableERC20Test'
        )

        const notRuggable = await notRuggableFactory.deploy('foobar', 'FOO') as NotRuggableERC20Test

        await notRuggable.deployed()

        // First mint is fine.
        await notRuggable.mintSome()

        // Normal transfers are fine.
        await notRuggable.transfer(notRuggable.address, 1000)

        // Second mint is not fine.
        let didRugPull = false
        try {
            await notRuggable.mintSome()
        } catch (e) {
            assert(e.toString().includes('revert ERR_RUG_PULL'))
            didRugPull = true
        }
        assert(didRugPull, 'failed to error rug pull')

        // Normal transfers still fine.
        await notRuggable.transfer(notRuggable.address, 2000)
    })
})