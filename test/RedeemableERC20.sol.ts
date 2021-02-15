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
        const ratio = ethers.BigNumber.from('2' + Util.eighteenZeros)

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
            (await redeemableERC20.ratio()).eq(ratio),
            'redeemable token ratio not set'
        )
        assert(
            (await redeemableERC20.reserve()) === reserve.address,
            'redeemable token reserve not set'
        )
        assert(
            (await redeemableERC20.reserve_total()).eq(reserveTotal),
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
        const unblockBlock = now + 5
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
            (await redeemableERC20.totalSupply()).eq(reserveTotal.mul(2)),
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

        // create a few blocks by sending some tokens around
        while ((await ethers.provider.getBlockNumber()) < unblockBlock) {
            await redeemableERC20.transfer(signers[1].address, 1)
        }

        // redeem should work now
        // redeem does NOT need approval
        const redeemableSignerBalanceBefore = await redeemableERC20.balanceOf(signers[0].address)
        const redeemableContractBalanceBefore = await redeemableERC20.balanceOf(redeemableERC20.address)
        const reserveSignerBalanceBefore = await reserve.balanceOf(signers[0].address)
        const reserveContractBalanceBefore = await reserve.balanceOf(redeemableERC20.address)

        // redemption should emit this
        let redeemEvent = new Promise(resolve => {
            redeemableERC20.once('Redeem', (redeemer, amount) => {
                assert(redeemer === signers[0].address, 'wrong redeemer address in event')
                assert(amount.eq(5000), 'wrong redemption amount in event')
                resolve(true)
            })
        })
        await redeemableERC20.redeem(5000)
        await redeemEvent

        const redeemableSignerBalanceAfter = await redeemableERC20.balanceOf(signers[0].address)
        const redeemableContractBalanceAfter = await redeemableERC20.balanceOf(redeemableERC20.address)
        const reserveSignerBalanceAfter = await reserve.balanceOf(signers[0].address)
        const reserveContractBalanceAfter = await reserve.balanceOf(redeemableERC20.address)

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
            await redeemableERC20.redeem(ethers.BigNumber.from('10000' + Util.eighteenZeros))
        } catch (e) {
            assert(e.toString().includes('revert ERC20: transfer amount exceeds balance'), 'wrong greedy error')
            greedyDidError = true
        }
        assert(greedyDidError, 'failed to stop greedy redeem')
    })
})