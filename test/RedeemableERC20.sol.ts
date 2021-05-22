import * as Util from './Util'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { ReserveToken } from '../typechain/ReserveToken'
import type { Prestige } from '../typechain/Prestige'

chai.use(solidity)
const { expect, assert } = chai

const NIL = 0;
const COPPER = 1;
const BRONZE = 2;
const SILVER = 3;
const GOLD = 4;
const PLATINUM = 5;
const DIAMOND = 6;
const CHAD = 7;
const JAWAD = 8;
const statuses = [NIL, COPPER, BRONZE, SILVER, GOLD, PLATINUM, DIAMOND, CHAD, JAWAD]

describe("RedeemableERC20", async function() {
    it("should lock tokens until redeemed", async function() {
        this.timeout(0)

        const signers = await ethers.getSigners()

        const reserve = await Util.basicDeploy("ReserveToken", {}) as ReserveToken

        // Constructing the RedeemableERC20 sets the parameters but nothing stateful happens.

        const prestigeFactory = await ethers.getContractFactory(
            'Prestige'
        )
        const prestige = await prestigeFactory.deploy() as Prestige
        const minimumStatus = NIL

        const redeemableERC20Factory = await ethers.getContractFactory(
            'RedeemableERC20'
        )
        const tokenName = 'RedeemableERC20'
        const tokenSymbol = 'RDX'
        const totalSupply = ethers.BigNumber.from('5000' + Util.eighteenZeros)

        const now = await ethers.provider.getBlockNumber()
        const unblockBlock = now + 8

        const redeemableERC20 = await redeemableERC20Factory.deploy(
            {
                name: tokenName,
                symbol: tokenSymbol,
                reserve: reserve.address,
                prestige: prestige.address,
                minimumStatus: minimumStatus,
                totalSupply: totalSupply,
                unblockBlock: unblockBlock
            }
        )

        await redeemableERC20.deployed()

        // There are no reserve tokens in the redeemer on construction
        assert(
            (await reserve.balanceOf(redeemableERC20.address)).eq(0),
            'reserve was not 0 on redeemable construction',
        )

        // There are no redeemable tokens created on construction
        assert(
            (await redeemableERC20.totalSupply()).eq(totalSupply),
            `total supply was not ${totalSupply} on redeemable construction`
        )

        // The unblock block is not set (i.e. contract is blocked)
        assert(
            (await redeemableERC20.unblockBlock()).eq(unblockBlock),
            `unblock block was not ${unblockBlock} in construction`
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
            (await redeemableERC20.reserve()) === reserve.address,
            'redeemable token reserve not set'
        )

        // Redemption not allowed yet.
        Util.assertError(
            async () => await redeemableERC20.redeem(100),
            'revert ERR_ONLY_UNBLOCKED',
            'redeem did not error'
        )

        assert(
            (await reserve.balanceOf(redeemableERC20.address)).eq(0),
            'reserve balance in redeemer is wrong'
        )
        assert(
            (await redeemableERC20.unblockBlock()).eq(unblockBlock),
            'unblock block not set correctly'
        )

        // We cannot send to the token address.
        Util.assertError(
            async () => await redeemableERC20.transfer(redeemableERC20.address, 10),
            'revert ERR_TOKEN_SEND_SELF',
            'self send was not blocked'
        )

        // create a few blocks by sending some tokens around
        while ((await ethers.provider.getBlockNumber()) < (unblockBlock - 1)) {
            await redeemableERC20.transfer(signers[1].address, 1)
        }

        // Funds need to be frozen once redemption unblocks.
        Util.assertError(
            async () => await redeemableERC20.transfer(signers[1].address, 1),
            'revert ERR_FROZEN',
            'funds were not frozen'
        )

        const redeemableERC202 = new ethers.Contract(redeemableERC20.address, redeemableERC20.interface, signers[1])
        // owner is on the unfreezable list.
        await redeemableERC202.transfer(signers[0].address, 1)

        // but not to anyone else.
        Util.assertError(
            async () => await redeemableERC20.transfer(signers[2].address, 1),
            'revert ERR_FROZEN',
            'funds were not frozen 2'
        )

        // pool exits and reserve tokens sent to redeemable ERC20 address
        const reserveTotal = ethers.BigNumber.from('1000' + Util.eighteenZeros)
        await reserve.transfer(redeemableERC20.address, reserveTotal)

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
            redeemableERC20.once('Redeem', (redeemer, [redeem, reserve]) => {
                assert(redeemer === signers[0].address, 'wrong redeemer address in event')
                assert(redeem.eq(redeemAmount), 'wrong redemption amount in event')
                assert(reserve.eq(expectedReserveRedemption), 'wrong reserve amount in event')
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
        Util.assertError(
            async () => await redeemableERC20.redeem(ethers.BigNumber.from('10000' + Util.eighteenZeros)),
            'revert ERC20: burn amount exceeds balance',
            'failed to stop greedy redeem',
        )

        // check math for more redemptions
        let i = 0
        // we can lose a few decimals of precision due to division logic in solidity
        const roughEqual = (a, b) => {
            return a.div(1000).sub(b.div(1000)) < 2
        }
        while (i < 10) {
            console.log(`redemption check 1: ${i}`)
            let event = new Promise(resolve => {
                redeemableERC20.once('Redeem', (redeemer, [redeem, reserve]) => {
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
            console.log(`redemption check 2: ${2}`)
            let event = new Promise(resolve => {
                redeemableERC20.once('Redeem', (redeemer, [redeem, reserve]) => {
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

    it('should allow token transfers in constructor regardless of owner prestige level', async function() {
        this.timeout(0)

        const signers = await ethers.getSigners()

        const reserve = await Util.basicDeploy("ReserveToken", {}) as ReserveToken

        // Constructing the RedeemableERC20 sets the parameters but nothing stateful happens.

        const prestigeFactory = await ethers.getContractFactory(
            'Prestige'
        )
        const prestige = await prestigeFactory.deploy() as Prestige

        const minimumStatus = COPPER

        const redeemableERC20Factory = await ethers.getContractFactory(
            'RedeemableERC20'
        )
        const tokenName = 'RedeemableERC20'
        const tokenSymbol = 'RDX'
        const totalSupply = ethers.BigNumber.from('5000' + Util.eighteenZeros)

        const now = await ethers.provider.getBlockNumber()
        const unblockBlock = now + 8

        const redeemableERC20 = await redeemableERC20Factory.deploy(
            {
                name: tokenName,
                symbol: tokenSymbol,
                reserve: reserve.address,
                prestige: prestige.address,
                minimumStatus: minimumStatus,
                totalSupply: totalSupply,
                unblockBlock: unblockBlock
            }
        )

        await redeemableERC20.deployed()

        // owner is made unfreezable during construction, so required token transfers can go ahead
        assert((await redeemableERC20.unfreezables(signers[0].address)), "owner not made unfreezable during construction")
    })

    it('should allow transfer only if redeemer meets minimum prestige level', async function() {
        this.timeout(0)

        const signers = await ethers.getSigners()

        const reserve = await Util.basicDeploy("ReserveToken", {}) as ReserveToken

        // Constructing the RedeemableERC20 sets the parameters but nothing stateful happens.

        const prestigeFactory = await ethers.getContractFactory(
            'Prestige'
        )
        const prestige = await prestigeFactory.deploy() as Prestige

        const minimumStatus = GOLD

        const redeemableERC20Factory = await ethers.getContractFactory(
            'RedeemableERC20'
        )
        const tokenName = 'RedeemableERC20'
        const tokenSymbol = 'RDX'
        const totalSupply = ethers.BigNumber.from('5000' + Util.eighteenZeros)

        const now = await ethers.provider.getBlockNumber()
        const unblockBlock = now + 8

        // grant second signer GOLD status so they can receive transferred tokens
        await prestige.setStatus(signers[1].address, GOLD, [])
        // grant third signer SILVER status which is NOT enough to receive transfers
        await prestige.setStatus(signers[2].address, SILVER, [])

        const redeemableERC20 = await redeemableERC20Factory.deploy(
            {
                name: tokenName,
                symbol: tokenSymbol,
                reserve: reserve.address,
                prestige: prestige.address,
                minimumStatus: minimumStatus,
                totalSupply: totalSupply,
                unblockBlock: unblockBlock
            }
        )

        await redeemableERC20.deployed()

        const redeemableERC20_SILVER = new ethers.Contract(redeemableERC20.address, redeemableERC20.interface, signers[2])
        Util.assertError(
            async () => await redeemableERC20.transfer(signers[2].address, 1),
            "revert ERR_MIN_STATUS",
            "user could receive transfers despite not meeting minimum status"
        )

        // create a few blocks by sending some tokens around, after which redeeming now possible
        while ((await ethers.provider.getBlockNumber()) < (unblockBlock - 1)) {
            await redeemableERC20.transfer(signers[1].address, 1)
        }

        // pool exits and reserve tokens sent to redeemable ERC20 address
        const reserveTotal = ethers.BigNumber.from('1000' + Util.eighteenZeros)
        await reserve.transfer(redeemableERC20.address, reserveTotal)

        // GOLD signer can redeem.
        await redeemableERC20.redeem(1)

        // There is no way the SILVER user can receive tokens so they also cannot redeem tokens.
        Util.assertError(
            async () => await redeemableERC20_SILVER.redeem(1),
            "revert ERC20: burn amount exceeds balance",
            "user could transfer despite not meeting minimum status"
        )

    })
})