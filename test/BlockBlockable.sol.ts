import * as Util from './Util'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { BlockBlockableTest } from '../typechain/BlockBlockableTest'

chai.use(solidity)
const { expect, assert } = chai

describe("BlockBlockable", async function() {
    let blockable: any;
    let moreBlockable: any;

    before(async () => {
        const blockableFactory = await ethers.getContractFactory(
            'BlockBlockableTest'
        )
        blockable = await blockableFactory.deploy() as BlockBlockableTest
        await blockable.deployed()

        moreBlockable = await blockableFactory.deploy() as BlockBlockableTest
        await moreBlockable.deployed()
    });


    it("should start in a blocked state", async function() {
        const isUnblocked = await blockable.isUnblocked()
        assert(!isUnblocked)
    });


    it("should return 0 the unblock block when starting the contract", async function() {
        await blockable.deployed()
        assert(ethers.BigNumber.from(0).eq(await blockable.unblock_block()), 'wrong starting unblock block 1')
    });


    it("should fail the OnlyBlocked modifier if unblock_block has not been entered", async function() {
        let err = false
        try {
            await blockable.blockable()
        } catch (e) {
            assert(e.toString().includes('revert ERR_ONLY_UNBLOCKED'), e)
            err = true
        }
        assert(err)
    });


    it("should return the current block as the unblocked block", async function() {
        const nowBlock = await ethers.provider.getBlockNumber()
        
        const unblockPromise = new Promise(resolve => {
            blockable.once('UnblockSet', (unblockBlock) => {
                assert(unblockBlock.eq(nowBlock), 'UnblockSet error has wrong unblock block')
                resolve(true)
            })
        })
        await blockable.trySetUnblockBlock(nowBlock)
        await unblockPromise
    });


    it("should call all functions and onlyUnblocked after being in the unblocked block", async function() {
        await blockable.unblockable()
        await blockable.blockable()
    });


    it("should fail to call an onlyBlocked function after passing the unblock block", async function() {
        let err = false
        try {
            await blockable.whileBlocked()
        } catch (e) {
            assert(e.toString().includes('revert ERR_ONLY_BLOCKED'))
            err = true
        }
        assert(err)
    });


    it("should fail when changing the unblock block", async function() {
        const nowBlock = await ethers.provider.getBlockNumber()
        let err = false
        try {
            await blockable.trySetUnblockBlock(nowBlock + 10)
        } catch (e) {
            assert(e.toString().includes('revert ERR_BLOCK_ONCE'))
            err = true
        }
        assert(err)
    });


    it("should fail if zero is entered in the unblock block", async function() {
        let err = false
        try {
            await moreBlockable.trySetUnblockBlock(0)
        } catch (e) {
            assert(e.toString().includes('revert ERR_BLOCK_ZERO'))
            err = true
        }
        assert(err)
    });


    it("should be able to use the onlyBlocked functions after changing the unblocked block", async function() {
        const nowerBlock = await ethers.provider.getBlockNumber()
        // This is +2 because the action of setting a block is +1
        await moreBlockable.trySetUnblockBlock(nowerBlock + 2)
        let err = false
        try {
            await moreBlockable.whileBlocked();
        } catch (error) {
            console.log(error)
            err = true
        }
        assert(!err)
    });


    it("should fail if an onlyUnblocked function is accessed after changing the unlock block to a higher block", async function() {
        let err = false
        try {
            await moreBlockable.blockable()
        } catch (e) {
            assert(e.toString().includes('revert ERR_ONLY_UNBLOCKED'))
            err = true
        }
        assert(err)
    });


    it("should be able to call a function after the block has been unblocked", async function() {
        await moreBlockable.noop()
        
        await moreBlockable.blockable()
        await moreBlockable.unblockable()
    });

})