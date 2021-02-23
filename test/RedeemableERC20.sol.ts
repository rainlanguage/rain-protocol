import * as Util from './Util'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { ReserveToken } from '../typechain/ReserveToken'

chai.use(solidity)
const { expect, assert } = chai

describe("RedeemableERC20", async function() {
    it("should lock tokens until redeemed", async function() {
        this.timeout(0)

        const signers = await ethers.getSigners()

        const reserve = await Util.basicDeploy("ReserveToken", {}) as ReserveToken

        // Constructing the RedeemableERC20 sets the parameters but nothing stateful happens.

        const redeemableERC20Factory = await ethers.getContractFactory(
            'RedeemableERC20'
        )

        const reserveTotal = ethers.BigNumber.from('1000' + Util.eighteenZeros)
        const ratio = ethers.BigNumber.from('5' + Util.eighteenZeros)

        const redeemableERC20 = await redeemableERC20Factory.deploy(
            'RedeemableERC20',
            'RDX',
            reserve.address,
            reserveTotal,
            ratio,
        )

        await redeemableERC20.deployed()

        // There are no reserve tokens in the redeemer on construction
        assert(
            (await reserve.balanceOf(redeemableERC20.address)).eq(0),
            'reserve was not 0 on redeemable construction',
        )

        // There are no redeemable tokens created on construction
        assert(
            (await redeemableERC20.totalSupply()).eq(0),
            'total supply was not 0 on redeemable construction'
        )

        // The unblock block is not set (i.e. contract is blocked)
        assert(
            (await redeemableERC20.unblock_block()).eq(0),
            'unblock block was set in construction'
        )

        // Normal ERC20 labelling applies
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
            (await redeemableERC20.owner()) === signers[0].address,
            'redeemable token not owned correctly'
        )
        assert(
            (await redeemableERC20.mint_ratio()).eq(ratio),
            'redeemable token ratio not set'
        )
        assert(
            (await redeemableERC20.reserve()) === reserve.address,
            'redeemable token reserve not set'
        )
        assert(
            (await redeemableERC20.reserve_init()).eq(reserveTotal),
            'reserve total not set in constructor'
        )

        // Redemption not allowed yet.
        let redeemDidError = false
        try {
            await redeemableERC20.redeem(100)
        }
        catch (e) {
            assert(e.toString().includes('revert ERR_ONLY_INIT'))
            redeemDidError = true
        }
        assert(redeemDidError)

        // Initializing does do stateful things and is required to redeem.

        const now = await ethers.provider.getBlockNumber()
        const unblockBlock = now + 8
        let allowanceDidError = false
        try {
            await redeemableERC20.init(unblockBlock)
        }
        catch(e) {
            assert(e.toString().includes('revert ERR_ALLOWANCE_RESERVE'))
            allowanceDidError = true
        }
        assert(allowanceDidError, 'failed to error before allowance is set')

        // We can init with the right approval
        await reserve.approve(redeemableERC20.address, reserveTotal)
        await redeemableERC20.init(unblockBlock)

        assert(
            (await reserve.balanceOf(redeemableERC20.address)).eq(reserveTotal),
            'reserve balance in redeemer is wrong'
        )
        assert(
            // The ratio is normalized to 2 inside the contract.
            (await redeemableERC20.totalSupply()).eq(reserveTotal.mul(5)),
            'total supply of redeemable token is wrong'
        )
        assert(
            (await redeemableERC20.unblock_block()).eq(unblockBlock),
            'unblock block not set correctly'
        )

        // We cannot redeem yet.
        let redeemBlockedDidError = false
        try {
            await redeemableERC20.redeem(100)
        }
        catch (e) {
            assert(e.toString().includes('revert ERR_ONLY_UNBLOCKED'))
            redeemBlockedDidError = true
        }
        assert(redeemBlockedDidError, 'redeem was not blocked')

        // We cannot send to the token address.
        let selfSendDidError = false
        try {
            await redeemableERC20.transfer(redeemableERC20.address, 10)
        } catch (e) {
            assert(e.toString().includes('revert ERR_TOKEN_SEND_SELF'))
            selfSendDidError = true
        }
        assert(selfSendDidError, 'self send was not blocked')

        // owner can unfreeze themselves (and others) _before_ unblocking.
        await redeemableERC20.addUnfreezable(signers[0].address)

        // create a few blocks by sending some tokens around
        while ((await ethers.provider.getBlockNumber()) < (unblockBlock - 1)) {
            await redeemableERC20.transfer(signers[1].address, 1)
        }

        // Funds need to be frozen once redemption unblocks.
        let frozenDidError = false
        try {
            await redeemableERC20.transfer(signers[1].address, 1)
        } catch (e) {
            assert(e.toString().includes('revert ERR_FROZEN'))
            frozenDidError = true
        }
        assert(frozenDidError, 'funds were not frozen')

        let frozenDidError2 = false
        const redeemableERC202 = new ethers.Contract(redeemableERC20.address, redeemableERC20.interface, signers[1])
        // owner is on the unfreezable list.
        await redeemableERC202.transfer(signers[0].address, 1)

        // but not to anyone else.
        try {
            await redeemableERC202.transfer(signers[2].address, 1)
        } catch (e) {
            assert(e.toString().includes('revert ERR_FROZEN'))
            frozenDidError2 = true
        }
        assert(frozenDidError2, 'funds were not frozen 2')

        // redeem should work now
        // redeem does NOT need approval
        const redeemableSignerBalanceBefore = await redeemableERC20.balanceOf(signers[0].address)
        const redeemableContractTotalSupplyBefore = await redeemableERC20.totalSupply()
        const reserveSignerBalanceBefore = await reserve.balanceOf(signers[0].address)
        const reserveContractBalanceBefore = await reserve.balanceOf(redeemableERC20.address)

        // redemption should emit this
        const redeemAmount = ethers.BigNumber.from('50' + Util.eighteenZeros)
        const expectedReserveRedemption = ethers.BigNumber.from('10' + Util.eighteenZeros)
        let redeemEvent = new Promise(resolve => {
            redeemableERC20.once('Redeem', (redeemer, redeem, reserve) => {
                assert(redeemer === signers[0].address, 'wrong redeemer address in event')
                assert(redeem.eq(redeemAmount), 'wrong redemption amount in event')
                assert(reserve.eq(expectedReserveRedemption), 'wront reserve amount in event')
                resolve(true)
            })
        })
        await redeemableERC20.redeem(redeemAmount)
        await redeemEvent

        const redeemableSignerBalanceAfter = await redeemableERC20.balanceOf(signers[0].address)
        const redeemableContractTotalSupplyAfter = await redeemableERC20.totalSupply()
        const reserveSignerBalanceAfter = await reserve.balanceOf(signers[0].address)
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

        // signer cannot redeem more tokens than they have
        let greedyDidError = false
        try {
            await redeemableERC20.redeem(ethers.BigNumber.from('10000' + Util.eighteenZeros))
        } catch (e) {
            assert(e.toString().includes('revert ERC20: transfer amount exceeds balance'), 'wrong greedy error')
            greedyDidError = true
        }
        assert(greedyDidError, 'failed to stop greedy redeem')

        // check math for more redemptions
        let i = 0
        // we can lose a few decimals of precision due to division logic in solidity
        const roughEqual = (a, b) => {
            return a.div(1000).sub(b.div(1000)) < 2
        }
        while (i < 10) {
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

        // Things dynamically recalculate if we dump more reserve back in the token contract
        await reserve.transfer(redeemableERC20.address, ethers.BigNumber.from('20' + Util.eighteenZeros))

        // This is the new redemption amount to expect.
        const expectedReserveRedemption2 = ethers.BigNumber.from('10224719101123595288')
        i = 0
        while (i < 10) {
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