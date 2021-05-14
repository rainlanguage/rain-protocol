import * as Util from './Util'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { ReserveToken } from '../typechain/ReserveToken'
import { BigNumber } from 'ethers'
import { reverse } from 'dns'

chai.use(solidity)
const { expect, assert } = chai

describe("RedeemableERC20", async function() {
    let owner: any;
    let bob: any;
    let reserve: any;
    let redeemableERC20: any;
    let mint_init: any;
    let unblock_block: number;
    let reserveTotal: any;
    let ratio: any;

    before(async () => {
        [owner, bob] = await ethers.getSigners()
        reserve = await Util.basicDeploy("ReserveToken", {}) as ReserveToken
        const redeemableERC20Factory = await ethers.getContractFactory(
            'RedeemableERC20'
        )

        reserveTotal = ethers.BigNumber.from('1000' + Util.eighteenZeros)
        ratio = ethers.BigNumber.from('5' + Util.eighteenZeros)
        //console.log((5 * 1000) + Util.eighteenZeros);
        mint_init = ethers.BigNumber.from((5 * 1000) + Util.eighteenZeros);
        unblock_block = await ethers.provider.getBlockNumber() + 10;

        redeemableERC20 = await redeemableERC20Factory.deploy(
            'RedeemableERC20',
            'RDX',
            reserve.address,
            mint_init,
            unblock_block,
        )
    });


    it("should return the initial data entered in the constructor", async function() {
        assert(
            (await redeemableERC20.name()) === 'RedeemableERC20',
            'redeemable token did not set name correctly'
        )
        assert(
            (await redeemableERC20.symbol()) === 'RDX',
            'redeemable token did not set symbol correctly',
        )
        // And other configuration
        assert(
            (await redeemableERC20.owner()) === owner.address,
            'redeemable token not owned correctly'
        )

        assert(
            (await redeemableERC20.mint_init()).eq(mint_init),
            'redeemable token ratio not set'
        )
        assert(
            (await redeemableERC20.reserve()) === reserve.address,
            'redeemable token reserve not set'
        )
    });


    it("should be no reserve tokens in the redeemer construction", async function() {
        assert((await reserve.balanceOf(redeemableERC20.address)).eq(0))
    });


    it("should be the total supply equal to the initial mintage", async function() {
        assert((await redeemableERC20.totalSupply()).eq(mint_init))
    });


    it("should fail due to blocking error blocked", async function() {
        let err = false
        try {
            await redeemableERC20.redeem(100)
        }
        catch (e) {
            assert(e.toString().includes('revert ERR_ONLY_UNBLOCKED'))
            err = true
        }
        assert(err)
    });


    it("should return the balance of the reserve in the redeemer", async function() {
        await reserve.connect(owner).transfer(redeemableERC20.address, reserveTotal);
        assert((await reserve.balanceOf(redeemableERC20.address)).eq(reserveTotal))
    });


    it("should fail to send the token address", async function() {
        let err = false
        try {
            await redeemableERC20.transfer(redeemableERC20.address, 10)
        } catch (e) {
            assert(e.toString().includes('revert ERR_TOKEN_SEND_SELF'))
            err = true
        }
        assert(err)
    });


    it("should the owner be able to unfreeze themselves (and others) _before_ unlocking", async function() {
        await redeemableERC20.addUnfreezable(owner.address)
        
        // Check that it has been unfreeze
        let isUnfreeze = false
        try {
            await redeemableERC20.transfer(owner.address, 1)
            isUnfreeze = true
        } catch (error) {
            console.log(error)
        }
        assert(isUnfreeze)
    });


    it("should freeze the funds once the reimbursement is unlocked", async function() {
        // create a few blocks by sending some tokens around
        while ((await ethers.provider.getBlockNumber()) < (unblock_block - 1)) {
            await redeemableERC20.transfer(bob.address, 1)
        }

        // Funds need to be frozen once redemption unblocks.
        let frozenDidError = false
        try {
            await redeemableERC20.transfer(bob.address, 1)
        } catch (e) {
            assert(e.toString().includes('revert ERR_FROZEN'))
            frozenDidError = true
        }
        assert(frozenDidError, 'funds were not frozen')
    });


    it("should issue the data correctly from redeem function ", async function() {
        const redeemableERC20Factory2 = await ethers.getContractFactory(
            'RedeemableERC20'
        )
        const redeemableERC202 = await redeemableERC20Factory2.deploy(
            'RedeemableERC20',
            'RDX',
            reserve.address,
            mint_init,
            unblock_block,
        )
        await reserve.connect(owner).transfer(redeemableERC202.address, reserveTotal);
        const redeemAmount = ethers.BigNumber.from('50' + Util.eighteenZeros)
        const expectedReserveRedemption = ethers.BigNumber.from('10' + Util.eighteenZeros)

        await expect(redeemableERC202.redeem(redeemAmount))
        .to.emit(redeemableERC202, 'Redeem')
        .withArgs(owner.address, redeemAmount, expectedReserveRedemption)
    });


    it("it should return the expected values if a rendition is performed", async function() {
        const redeemableSignerBalanceBefore = await redeemableERC20.balanceOf(owner.address)
        const redeemableContractTotalSupplyBefore = await redeemableERC20.totalSupply()
        const reserveSignerBalanceBefore = await reserve.balanceOf(owner.address)
        const reserveContractBalanceBefore = await reserve.balanceOf(redeemableERC20.address)

        // redemption should emit this
        const redeemAmount = ethers.BigNumber.from('50' + Util.eighteenZeros)
        const expectedReserveRedemption = ethers.BigNumber.from('10' + Util.eighteenZeros)
        await expect(redeemableERC20.redeem(redeemAmount))
        .to.emit(redeemableERC20, 'Redeem')
        .withArgs(owner.address, redeemAmount, expectedReserveRedemption)

        const redeemableSignerBalanceAfter = await redeemableERC20.balanceOf(owner.address)
        const redeemableContractTotalSupplyAfter = await redeemableERC20.totalSupply()
        const reserveSignerBalanceAfter = await reserve.balanceOf(owner.address)
        const reserveContractBalanceAfter = await reserve.balanceOf(redeemableERC20.address)

        // signer should have redeemed 50 redeemable tokens
        assert(
            redeemableSignerBalanceBefore.sub(redeemableSignerBalanceAfter).eq(redeemAmount),
            'wrong number of redeemable tokens redeemed'
        )

        // signer should have gained 10 reserve tokens
        assert(
            reserveSignerBalanceAfter.sub(reserveSignerBalanceBefore).eq(expectedReserveRedemption),
            `wrong number of reserve tokens released ${reserveSignerBalanceBefore} ${reserveSignerBalanceAfter}`
        )

        // total supply should have lost 50 redeemable tokens
        assert(
            redeemableContractTotalSupplyBefore.sub(redeemableContractTotalSupplyAfter).eq(redeemAmount),
            `contract did not receive correct tokens ${redeemableContractTotalSupplyBefore} ${redeemableContractTotalSupplyAfter}`
        )

        // contract should have sent 10 reserve tokens
        assert(
            reserveContractBalanceBefore.sub(reserveContractBalanceAfter).eq(expectedReserveRedemption),
            'contract did not send correct reserve tokens'
        )
    });


    it("should not be able to redeem more tokens than they have", async function() {
        let err = false
        try {
            await redeemableERC20.redeem(ethers.BigNumber.from('10000' + Util.eighteenZeros))
        } catch (e) {
            assert(e.toString().includes('revert ERC20: transfer amount exceeds balance'))
            err = true
        }
        assert(err, 'wrong greedy error')
    });


    it("check math for more redemptions", async function() {
        // Constructing the RedeemableERC20 sets the parameters but nothing stateful happens.
        const redeemableERC20Factory = await ethers.getContractFactory(
            'RedeemableERC20'
        )

        mint_init = ethers.BigNumber.from((5 * 1000) + Util.eighteenZeros);
        unblock_block = await ethers.provider.getBlockNumber() + 2;

        redeemableERC20 = await redeemableERC20Factory.deploy(
            'RedeemableERC20',
            'RDX',
            reserve.address,
            mint_init,
            unblock_block,
        )

        await redeemableERC20.deployed()

        await reserve.approve(redeemableERC20.address, mint_init)

        const redeemAmount = ethers.BigNumber.from('50' + Util.eighteenZeros)
        const expectedReserveRedemption = ethers.BigNumber.from('10' + Util.eighteenZeros)
        // check math for more redemptions
        let i = 0
        // we can lose a few decimals of precision due to division logic in solidity
        const roughEqual = (a, b) => {
            return a.div(1000).sub(b.div(1000)) < 2
        }
        while (i < 2) {
            let event = new Promise(resolve => {
                redeemableERC20.once('Redeem', (redeemer, redeem, reserve) => {
                    assert(roughEqual(redeem, redeemAmount), `bad redemption ${redeem} ${redeemAmount}`)
                    assert(roughEqual(reserve, expectedReserveRedemption), `bad redemption reserve ${reserve} ${expectedReserveRedemption}`)
                    resolve(true)
                })
            })
            await redeemableERC20.redeem(redeemAmount)
            await event
            i++
        }
    });


    it("redemption should emit this", async function() {
        // Constructing the RedeemableERC20 sets the parameters but nothing stateful happens.
        const redeemableERC20Factory = await ethers.getContractFactory(
            'RedeemableERC20'
        )

        mint_init = ethers.BigNumber.from((5 * 1000) + Util.eighteenZeros);
        unblock_block = await ethers.provider.getBlockNumber() + 2;

        redeemableERC20 = await redeemableERC20Factory.deploy(
            'RedeemableERC20',
            'RDX',
            reserve.address,
            mint_init,
            unblock_block,
        )

        await redeemableERC20.deployed()

        await reserve.approve(redeemableERC20.address, mint_init)

        const redeemAmount = ethers.BigNumber.from('50' + Util.eighteenZeros)

        // Things dynamically recalculate if we dump more reserve back in the token contract
        await reserve.transfer(redeemableERC20.address, ethers.BigNumber.from('20' + Util.eighteenZeros))
        // we can lose a few decimals of precision due to division logic in solidity
        const roughEqual = (a, b) => {
            return a.div(1000).sub(b.div(1000)) < 2
        }
        // This is the new redemption amount to expect.
        const expectedReserveRedemption2 = ethers.BigNumber.from('10224719101123595288')
        let i = 0
        while (i < 2) {
            let event = new Promise(resolve => {
                redeemableERC20.once('Redeem', (redeemer, redeem, reserve) => {
                    assert(roughEqual(redeem, redeemAmount), `bad redemption ${redeem} ${redeemAmount}`)
                    assert(roughEqual(reserve, expectedReserveRedemption2), `bad redemption reserve 2 ${reserve} ${expectedReserveRedemption2}`)
                    resolve(true)
                })
            })
            await redeemableERC20.redeem(redeemAmount)
            await event
            i++
        }
    })
})