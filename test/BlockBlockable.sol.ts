import * as Util from './Util'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { BlockBlockableTest } from '../typechain/BlockBlockableTest'

chai.use(solidity)
const { expect, assert } = chai

describe("BlockBlockable", async function () {
    it("should be (un)blockable", async function () {
        this.timeout(0)

        const signers = await ethers.getSigners()

        const blockableFactory = await ethers.getContractFactory(
            'BlockBlockableTest'
        )

        const blockable = await blockableFactory.deploy() as BlockBlockableTest

        await blockable.deployed()

        assert(ethers.BigNumber.from(0).eq(await blockable.unblockBlock()), 'wrong starting unblock block 1')

        // can always call unblockable function
        await blockable.unblockable()

        // can call blocked at the start
        await blockable.whileBlocked()

        let blockableDidError = false
        try {
            await blockable.blockable()
        } catch (e) {
            assert(e.toString().includes('revert ERR_ONLY_UNBLOCKED'), e)
            blockableDidError = true
        }
        assert(blockableDidError, 'blockable did not error')

        const nowBlock = await ethers.provider.getBlockNumber()

        assert(nowBlock > 0, 'blocked at block 0')

        const unblockPromise = new Promise(resolve => {
            blockable.once('UnblockSet', (unblockBlock) => {
                assert(unblockBlock.eq(nowBlock), 'UnblockSet error has wrong unblock block')
                resolve(true)
            })
        })
        await blockable.trySetUnblockBlock(nowBlock)
        await unblockPromise

        // we can call all functions now
        await blockable.unblockable()
        await blockable.blockable()

        // except the blocked
        let whileBlockedDidError = false
        try {
            await blockable.whileBlocked()
        } catch (e) {
            assert(e.toString().includes('revert ERR_ONLY_BLOCKED'))
            whileBlockedDidError = true
        }
        assert(whileBlockedDidError, 'only blocked did not error when unblocked')

        // except changing the unblock block
        let changeUnblockDidError = false
        try {
            await blockable.trySetUnblockBlock(nowBlock + 10)
        } catch (e) {
            assert(e.toString().includes('revert ERR_BLOCK_ONCE'))
            changeUnblockDidError = true
        }
        assert(changeUnblockDidError, 'changing the unblock did not error')

        // test some other cases
        const moreBlockable = await blockableFactory.deploy() as BlockBlockableTest

        await moreBlockable.deployed()

        assert(ethers.BigNumber.from(0).eq(await moreBlockable.unblockBlock()), 'wrong starting unblock block 2')

        await moreBlockable.unblockable()

        let blockableDidZeroError = false
        try {
            await moreBlockable.trySetUnblockBlock(0)
        } catch (e) {
            assert(e.toString().includes('revert ERR_BLOCK_ZERO'))
            blockableDidZeroError = true
        }
        assert(blockableDidZeroError, 'the unblock block zeroed')

        let moreBlockableDidError = false
        try {
            await moreBlockable.blockable()
        } catch (e) {
            assert(e.toString().includes('revert ERR_ONLY_UNBLOCKED'))
            moreBlockableDidError = true
        }
        assert(moreBlockableDidError, 'moreBlockable did not block')

        const nowerBlock = await ethers.provider.getBlockNumber()

        // This is +2 because the action of setting a block is +1
        await moreBlockable.trySetUnblockBlock(nowerBlock + 2)

        await moreBlockable.unblockable()

        let moreBlockableDidErrorAgain = false
        try {
            await moreBlockable.blockable()
        } catch (e) {
            assert(e.toString().includes('revert ERR_ONLY_UNBLOCKED'))
            moreBlockableDidErrorAgain = true
        }
        assert(moreBlockableDidErrorAgain, 'moreBlockable did not block again')

        // bump a block
        moreBlockable.noop()

        await moreBlockable.blockable()
        await moreBlockable.unblockable()
    })
})