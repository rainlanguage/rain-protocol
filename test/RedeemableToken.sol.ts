import * as Util from './Util'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { ReserveToken } from '../typechain/ReserveToken'

chai.use(solidity)
const { expect, assert } = chai

describe("RedeemableToken", async function() {
    it("should lock tokens until redeemed", async function() {
        this.timeout(0)

        const signers = await ethers.getSigners()

        const reserve = await Util.basicDeploy("ReserveToken", {}) as ReserveToken

        // Constructing the RedeemableToken sets the parameters but nothing stateful happens.

        const redeemableTokenFactory = await ethers.getContractFactory(
            'RedeemableToken'
        )

        const reserveTotal = ethers.BigNumber.from('1000' + Util.eighteenZeros)
        const ratio = ethers.BigNumber.from('2' + Util.eighteenZeros)

        const redeemableToken = await redeemableTokenFactory.deploy(
            'RedeemableToken',
            'RDX',
            reserve.address,
            reserveTotal,
            ratio,
        )

        await redeemableToken.deployed()

        // There are no reserve tokens in the redeemer on construction
        assert(
            (await reserve.balanceOf(redeemableToken.address)).eq(0),
            'reserve was not 0 on redeemable construction',
        )

        // There are no redeemable tokens created on construction
        assert(
            (await redeemableToken.totalSupply()).eq(0),
            'total supply was not 0 on redeemable construction'
        )

        // The unblock block is not set (i.e. contract is blocked)
        assert(
            (await redeemableToken.unblock_block()).eq(0),
            'unblock block was set in construction'
        )


        // Normal ERC20 labelling applies
        assert(
            (await redeemableToken.name()) === 'RedeemableToken',
            'redeemable token did not set name correctly'
        )
        assert(
            (await redeemableToken.symbol()) === 'RDX',
            'redeemable token did not set symbol correctly',
        )
        // And other configuration
        assert(
            (await redeemableToken.owner()) === signers[0].address,
            'redeemable token not owned correctly'
        )
        assert(
            (await redeemableToken.ratio()).eq(ratio),
            'redeemable token ratio not set'
        )
        assert(
            (await redeemableToken.reserve()) === reserve.address,
            'redeemable token reserve not set'
        )
        assert(
            (await redeemableToken.reserve_total()).eq(reserveTotal),
            'reserve total not set in constructor'
        )

        // Redemption not allowed yet.
        let redeemDidError = false
        try {
            await redeemableToken.redeem(100)
        }
        catch (e) {
            assert(e.toString().includes('revert ERR_ONLY_INIT'))
            redeemDidError = true
        }
        assert(redeemDidError)

        // Initializing does do stateful things and is required to redeem.

        const now = await ethers.provider.getBlockNumber()
        const unblockBlock = now + 5
        let allowanceDidError = false
        try {
            await redeemableToken.init(unblockBlock)
        }
        catch(e) {
            assert(e.toString().includes('revert ERR_ALLOWANCE_RESERVE'))
            allowanceDidError = true
        }
        assert(allowanceDidError, 'failed to error before allowance is set')

        // We can init with the right approval
        await reserve.approve(redeemableToken.address, reserveTotal)
        await redeemableToken.init(unblockBlock)

        assert(
            (await reserve.balanceOf(redeemableToken.address)).eq(reserveTotal),
            'reserve balance in redeemer is wrong'
        )
        assert(
            // The ratio is normalized to 2 inside the contract.
            (await redeemableToken.totalSupply()).eq(reserveTotal.mul(2)),
            'total supply of redeemable token is wrong'
        )
        assert(
            (await redeemableToken.unblock_block()).eq(unblockBlock),
            'unblock block not set correctly'
        )

        // We cannot redeem yet.
        let redeemBlockedDidError = false
        try {
            await redeemableToken.redeem(100)
        }
        catch (e) {
            assert(e.toString().includes('revert ERR_ONLY_UNBLOCKED'))
            redeemBlockedDidError = true
        }
        assert(redeemBlockedDidError, 'redeem was not blocked')

        // create a few blocks by sending some tokens around
        while ((await ethers.provider.getBlockNumber()) < unblockBlock) {
            await redeemableToken.transfer(signers[1].address, 1)
        }

        // redeem should work now
        // redeem does NOT need approval
        const redeemableSignerBalanceBefore = await redeemableToken.balanceOf(signers[0].address)
        const redeemableContractBalanceBefore = await redeemableToken.balanceOf(redeemableToken.address)
        const reserveSignerBalanceBefore = await reserve.balanceOf(signers[0].address)
        const reserveContractBalanceBefore = await reserve.balanceOf(redeemableToken.address)

        // redemption should emit this
        let redeemEvent = new Promise(resolve => {
            redeemableToken.once('Redeem', (redeemer, amount) => {
                assert(redeemer === signers[0].address, 'wrong redeemer address in event')
                assert(amount.eq(5000), 'wrong redemption amount in event')
                resolve(true)
            })
        })
        await redeemableToken.redeem(5000)
        await redeemEvent

        const redeemableSignerBalanceAfter = await redeemableToken.balanceOf(signers[0].address)
        const redeemableContractBalanceAfter = await redeemableToken.balanceOf(redeemableToken.address)
        const reserveSignerBalanceAfter = await reserve.balanceOf(signers[0].address)
        const reserveContractBalanceAfter = await reserve.balanceOf(redeemableToken.address)

        // signer should have redeemed 5000 redeemable tokens
        assert(
            redeemableSignerBalanceBefore.sub(redeemableSignerBalanceAfter).eq(5000),
            'wrong number of redeemable tokens redeemed'
        )

        // signer should have gained 2500 reserve tokens
        assert(
            reserveSignerBalanceAfter.sub(reserveSignerBalanceBefore).eq(2500),
            'wrong number of reserve tokens released'
        )

        // contract should have gained 5000 redeemable tokens
        assert(
            redeemableContractBalanceAfter.sub(redeemableContractBalanceBefore).eq(5000),
            'contract did not receive correct tokens'
        )

        // contract should have sent 2500 reserve tokens
        assert(
            reserveContractBalanceBefore.sub(reserveContractBalanceAfter).eq(2500),
            'contract did not send correct reserve tokens'
        )

        // signer cannot redeem more tokens than they have
        let greedyDidError = false
        try {
            await redeemableToken.redeem(ethers.BigNumber.from('10000' + Util.eighteenZeros))
        } catch (e) {
            assert(e.toString().includes('revert ERC20: transfer amount exceeds balance'), 'wrong greedy error')
            greedyDidError = true
        }
        assert(greedyDidError, 'failed to stop greedy redeem')
    })
})