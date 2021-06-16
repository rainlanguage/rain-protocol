import * as Util from './Util'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { ReserveToken } from '../typechain/ReserveToken'
import type { Prestige } from '../typechain/Prestige'

chai.use(solidity)
const { expect, assert } = chai

enum Status {
    NIL,
    COPPER,
    BRONZE,
    SILVER,
    GOLD,
    PLATINUM,
    DIAMOND,
    CHAD,
    JAWAD,
}

describe("RedeemableERC20", async function () {
    it("should lock tokens until redeemed", async function () {
        this.timeout(0)

        const signers = await ethers.getSigners()

        const reserve = await Util.basicDeploy("ReserveToken", {}) as ReserveToken

        // Constructing the RedeemableERC20 sets the parameters but nothing stateful happens.

        const prestigeFactory = await ethers.getContractFactory(
            'Prestige'
        )
        const prestige = await prestigeFactory.deploy() as Prestige
        const minimumStatus = Status.NIL

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
                prestige: prestige.address,
                minimumStatus: minimumStatus,
                totalSupply: totalSupply,
            }
        )

        await redeemableERC20.deployed()
        await redeemableERC20.ownerSetUnblockBlock(unblockBlock)
        await redeemableERC20.ownerAddRedeemable(reserve.address)

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

        assert(
            (await redeemableERC20.getRedeemables())[0] == reserve.address,
            `reserve address not set as redeemable`
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

        // Redemption not allowed yet.
        await Util.assertError(
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
        await Util.assertError(
            async () => await redeemableERC20.transfer(redeemableERC20.address, 10),
            'revert ERR_TOKEN_SEND_SELF',
            'self send was not blocked'
        )

        // create a few blocks by sending some tokens around
        while ((await ethers.provider.getBlockNumber()) < (unblockBlock - 1)) {
            await redeemableERC20.transfer(signers[1].address, 1)
        }

        // Funds need to be frozen once redemption unblocks.
        await Util.assertError(
            async () => await redeemableERC20.transfer(signers[1].address, 1),
            'revert ERR_FROZEN',
            'funds were not frozen'
        )

        const redeemableERC202 = new ethers.Contract(redeemableERC20.address, redeemableERC20.interface, signers[1])
        // owner is on the unfreezable list.
        await redeemableERC202.transfer(signers[0].address, 1)

        // but not to anyone else.
        await Util.assertError(
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
        // signer redeems all tokens they have for fraction of each redeemable asset
        const redeemEvent = new Promise(resolve => {
            redeemableERC20.once('Redeem', (redeemer, redeem) => {
                assert(redeemer === signers[0].address, 'wrong redeemer address in event')
                assert(redeem.eq(redeemAmount), 'wrong redemption amount in event')
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
        await Util.assertError(
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
                redeemableERC20.once('Redeem', (redeemer, redeem) => {
                    assert(roughEqual(redeem, redeemAmount), `bad redemption ${redeem} ${redeemAmount}`)
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
                redeemableERC20.once('Redeem', (redeemer, redeem) => {
                    assert(roughEqual(redeem, redeemAmount), `bad redemption ${redeem} ${redeemAmount}`)
                    resolve(true)
                })
            })
            await redeemableERC20.redeem(redeemAmount)
            await event
            i++
        }
    })

    it("should only allow owner to set unblock block", async function () {
        this.timeout(0)

        const signers = await ethers.getSigners()

        const prestigeFactory = await ethers.getContractFactory(
            'Prestige'
        )
        const prestige = await prestigeFactory.deploy() as Prestige
        const minimumStatus = Status.NIL

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
                prestige: prestige.address,
                minimumStatus: minimumStatus,
                totalSupply: totalSupply,
            }
        )

        await redeemableERC20.deployed()

        assert((await redeemableERC20.unblockBlock()).isZero(), "unblock block was wrongly set")

        const redeemableERC201 = new ethers.Contract(redeemableERC20.address, redeemableERC20.interface, signers[1])

        await Util.assertError(
            async () => await redeemableERC201.ownerSetUnblockBlock(unblockBlock),
            "revert Ownable: caller is not the owner",
            "non-owner was wrongly able to set token unblock block"
        )

        await redeemableERC20.ownerSetUnblockBlock(unblockBlock)
    })

    it("should set owner as unfreezable on construction", async function () {
        this.timeout(0)

        const signers = await ethers.getSigners()

        const prestigeFactory = await ethers.getContractFactory(
            'Prestige'
        )
        const prestige = await prestigeFactory.deploy() as Prestige
        const minimumStatus = Status.NIL

        const redeemableERC20Factory = await ethers.getContractFactory(
            'RedeemableERC20'
        )
        const tokenName = 'RedeemableERC20'
        const tokenSymbol = 'RDX'
        const totalSupply = ethers.BigNumber.from('5000' + Util.eighteenZeros)

        const redeemableERC20 = await redeemableERC20Factory.deploy(
            {
                name: tokenName,
                symbol: tokenSymbol,
                prestige: prestige.address,
                minimumStatus: minimumStatus,
                totalSupply: totalSupply,
            }
        )

        await redeemableERC20.deployed()

        assert(await redeemableERC20.unfreezables(signers[0].address), "owner not set as unfreezable on token construction")
    })

    it('should allow token transfers in constructor regardless of owner prestige level', async function () {
        this.timeout(0)

        const signers = await ethers.getSigners()

        const reserve = await Util.basicDeploy("ReserveToken", {}) as ReserveToken

        // Constructing the RedeemableERC20 sets the parameters but nothing stateful happens.

        const prestigeFactory = await ethers.getContractFactory(
            'Prestige'
        )
        const prestige = await prestigeFactory.deploy() as Prestige

        // Set owner to COPPER status, lower than minimum status of DIAMOND
        await prestige.setStatus(signers[0].address, Status.COPPER, [])

        const minimumStatus = Status.DIAMOND

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
                prestige: prestige.address,
                minimumStatus: minimumStatus,
                totalSupply: totalSupply,
            }
        )

        await redeemableERC20.deployed()
        await redeemableERC20.ownerSetUnblockBlock(unblockBlock)

        // owner is made unfreezable during construction, so required token transfers can go ahead
        assert((await redeemableERC20.unfreezables(signers[0].address)), "owner not made unfreezable during construction")

        await reserve.transfer(redeemableERC20.address, 1)
    })

    it('should allow transfer only if redeemer meets minimum prestige level', async function () {
        this.timeout(0)

        const signers = await ethers.getSigners()

        const reserve = await Util.basicDeploy("ReserveToken", {}) as ReserveToken

        // Constructing the RedeemableERC20 sets the parameters but nothing stateful happens.

        const prestigeFactory = await ethers.getContractFactory(
            'Prestige'
        )
        const prestige = await prestigeFactory.deploy() as Prestige

        const minimumStatus = Status.GOLD

        const redeemableERC20Factory = await ethers.getContractFactory(
            'RedeemableERC20'
        )
        const tokenName = 'RedeemableERC20'
        const tokenSymbol = 'RDX'
        const totalSupply = ethers.BigNumber.from('5000' + Util.eighteenZeros)

        const now = await ethers.provider.getBlockNumber()
        const unblockBlock = now + 8

        // grant second signer GOLD status so they can receive transferred tokens
        await prestige.setStatus(signers[1].address, Status.GOLD, [])
        // grant third signer SILVER status which is NOT enough to receive transfers
        await prestige.setStatus(signers[2].address, Status.SILVER, [])

        const redeemableERC20 = await redeemableERC20Factory.deploy(
            {
                name: tokenName,
                symbol: tokenSymbol,
                prestige: prestige.address,
                minimumStatus: minimumStatus,
                totalSupply: totalSupply,
            }
        )

        await redeemableERC20.deployed()
        await redeemableERC20.ownerSetUnblockBlock(unblockBlock)

        const redeemableERC20_SILVER = new ethers.Contract(redeemableERC20.address, redeemableERC20.interface, signers[2])
        await Util.assertError(
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
        await Util.assertError(
            async () => await redeemableERC20_SILVER.redeem(1),
            "revert ERC20: burn amount exceeds balance",
            "user could transfer despite not meeting minimum status"
        )

    })

    it('should return multiple redeemable assets upon redeeming', async function () {
        this.timeout(0)

        const FIVE_TOKENS = ethers.BigNumber.from('5' + Util.eighteenZeros);
        const TEN_TOKENS = ethers.BigNumber.from('10' + Util.eighteenZeros);
        const TWENTY_TOKENS = ethers.BigNumber.from('20' + Util.eighteenZeros);

        const signers = await ethers.getSigners()

        const reserve1 = await Util.basicDeploy("ReserveToken", {}) as ReserveToken
        const reserve2 = await Util.basicDeploy("ReserveToken", {}) as ReserveToken

        // Constructing the RedeemableERC20 sets the parameters but nothing stateful happens.

        const prestigeFactory = await ethers.getContractFactory(
            'Prestige'
        )
        const prestige = await prestigeFactory.deploy() as Prestige

        const minimumStatus = Status.NIL

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
                prestige: prestige.address,
                minimumStatus: minimumStatus,
                totalSupply: totalSupply,
            }
        )

        await redeemableERC20.deployed()
        await redeemableERC20.ownerSetUnblockBlock(unblockBlock)
        await redeemableERC20.ownerAddRedeemable(reserve1.address)
        await redeemableERC20.ownerAddRedeemable(reserve2.address)

        // There are no reserve tokens in the redeemer on construction
        assert(
            (await reserve1.balanceOf(redeemableERC20.address)).eq(0) && (await reserve2.balanceOf(redeemableERC20.address)).eq(0),
            'reserve was not 0 on redeemable construction',
        )

        await redeemableERC20.transfer(signers[1].address, TEN_TOKENS)

        // create a few blocks by sending some tokens around, after which redeeming now possible
        while ((await ethers.provider.getBlockNumber()) < (unblockBlock - 1)) {
            await redeemableERC20.transfer(signers[2].address, TEN_TOKENS)
        }

        // at this point signer[1] should have 10 tokens
        assert((await redeemableERC20.balanceOf(signers[1].address)).eq(TEN_TOKENS), "signer[1] does not have a balance of 10 tokens")
        // at this point signer[2] should have 20 tokens
        assert((await redeemableERC20.balanceOf(signers[2].address)).eq(TWENTY_TOKENS), "signer[2] does not have a balance of 20 tokens")

        // pool exits and reserve tokens sent to redeemable ERC20 address
        const reserve1Total = ethers.BigNumber.from('1000' + Util.eighteenZeros)
        const reserve2Total = ethers.BigNumber.from('2000' + Util.eighteenZeros)

        // move all reserve tokens, to become redeemables
        await reserve1.transfer(redeemableERC20.address, reserve1Total)
        await reserve2.transfer(redeemableERC20.address, reserve2Total)

        // contract should hold correct redeemables
        assert((await reserve1.balanceOf(redeemableERC20.address)).eq(reserve1Total), "contract does not hold correct amount of reserve 1 tokens")
        assert((await reserve2.balanceOf(redeemableERC20.address)).eq(reserve2Total), "contract does not hold correct amount of reserve 2 tokens")

        // signer 1
        const redeemableERC20_1 = new ethers.Contract(redeemableERC20.address, redeemableERC20.interface, signers[1])

        // contract before
        const redeemableContractTotalSupplyBefore = await redeemableERC20.totalSupply()
        const reserve1ContractBalanceBefore = await reserve1.balanceOf(redeemableERC20.address)
        const reserve2ContractBalanceBefore = await reserve2.balanceOf(redeemableERC20.address)

        // Signer before
        const redeemableSignerBalanceBefore = await redeemableERC20.balanceOf(signers[1].address)
        const reserve1SignerBalanceBefore = await reserve1.balanceOf(signers[1].address)
        const reserve2SignerBalanceBefore = await reserve2.balanceOf(signers[1].address)

        // redeem half of signer 1 holding
        const redeemAmount = FIVE_TOKENS;

        // expect every redeemable released in the same proportion.
        const expectedReserve1Redemption =
            redeemAmount
                .mul(ethers.BigNumber.from(reserve1ContractBalanceBefore))
                .div(ethers.BigNumber.from(redeemableContractTotalSupplyBefore))
        const expectedReserve2Redemption =
            redeemAmount
                .mul(ethers.BigNumber.from(reserve2ContractBalanceBefore))
                .div(ethers.BigNumber.from(redeemableContractTotalSupplyBefore))

        // signer redeems all tokens they have for fraction of each redeemable asset
        const redeemEvent = new Promise(resolve => {
            redeemableERC20.once('Redeem', (redeemer, redeem) => {
                assert(redeemer === signers[1].address, 'wrong redeemer address in event')
                assert(redeem.eq(redeemAmount), 'wrong redemption amount in event')
                resolve(true)
            })
        })

        await redeemableERC20_1.redeem(redeemAmount)
        await redeemEvent

        // contract after
        const redeemableContractTotalSupplyAfter = await redeemableERC20.totalSupply()
        const reserve1ContractBalanceAfter = await reserve1.balanceOf(redeemableERC20.address)
        const reserve2ContractBalanceAfter = await reserve2.balanceOf(redeemableERC20.address)

        // Signer after
        const redeemableSignerBalanceAfter = await redeemableERC20.balanceOf(signers[1].address)
        const reserve1SignerBalanceAfter = await reserve1.balanceOf(signers[1].address)
        const reserve2SignerBalanceAfter = await reserve2.balanceOf(signers[1].address)

        // signer should have redeemed half of their redeemable tokens
        assert(
            redeemableSignerBalanceBefore.sub(redeemableSignerBalanceAfter).eq(redeemAmount),
            'wrong number of redeemable tokens redeemed'
        )

        // signer should have gained fraction of reserve 1 tokens
        assert(
            reserve1SignerBalanceAfter.sub(reserve1SignerBalanceBefore).eq(expectedReserve1Redemption),
            `wrong number of reserve 1 tokens released ${reserve1SignerBalanceBefore} ${reserve1SignerBalanceAfter}, expected ${expectedReserve1Redemption}`
        )

        // signer should have gained fraction of reserve 2 tokens
        assert(
            reserve2SignerBalanceAfter.sub(reserve2SignerBalanceBefore).eq(expectedReserve2Redemption),
            `wrong number of reserve 2 tokens released ${reserve2SignerBalanceBefore} ${reserve2SignerBalanceAfter}, expected ${expectedReserve2Redemption}`
        )

        // total supply of contract tokens should be 5 less
        assert(
            (redeemableContractTotalSupplyBefore).sub(redeemableContractTotalSupplyAfter).eq(redeemAmount),
            `wrong amount of total token supply after ${redeemAmount} were redeemed ${redeemableContractTotalSupplyBefore} ${redeemableContractTotalSupplyAfter}`
        )

        // reserve 1 amount at contract address should reduce
        assert(
            (reserve1ContractBalanceBefore).sub(reserve1ContractBalanceAfter).eq(expectedReserve1Redemption),
            'wrong amount of reserve 1 at contract address'
        )

        // reserve 2 amount at contract address should reduce
        assert(
            (reserve2ContractBalanceBefore).sub(reserve2ContractBalanceAfter).eq(expectedReserve2Redemption),
            'wrong amount of reserve 2 at contract address'
        )
    })

    it('should not prevent redeeming other redeemables when a redeemable transfer fails', async function () {
        this.timeout(0)

        const FIVE_TOKENS = ethers.BigNumber.from('5' + Util.eighteenZeros);
        const TEN_TOKENS = ethers.BigNumber.from('10' + Util.eighteenZeros);
        const TWENTY_TOKENS = ethers.BigNumber.from('20' + Util.eighteenZeros);

        const signers = await ethers.getSigners()

        const reserve1 = await Util.basicDeploy("ReserveToken", {}) as ReserveToken
        const reserve2 = await Util.basicDeploy("ReserveToken", {}) as ReserveToken

        const prestigeFactory = await ethers.getContractFactory(
            'Prestige'
        )
        const prestige = await prestigeFactory.deploy() as Prestige

        const minimumStatus = Status.NIL

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
                prestige: prestige.address,
                minimumStatus: minimumStatus,
                totalSupply: totalSupply,
            }
        )

        await redeemableERC20.deployed()
        await redeemableERC20.ownerSetUnblockBlock(unblockBlock)
        await redeemableERC20.ownerAddRedeemable(reserve1.address)
        await redeemableERC20.ownerAddRedeemable(reserve2.address)

        await reserve2.transfer(redeemableERC20.address, await reserve2.totalSupply())

        // reserve 1 blacklists signer 1. Signer 1 cannot receive reserve 1 upon redeeming contract tokens
        reserve1.ownerAddFreezable(signers[1].address)

        const redeemFailEvent = new Promise(resolve => {
            redeemableERC20.once('RedeemFail', (redeemer, redeemable) => {
                assert(redeemer === signers[1].address, 'wrong redeemer address in event')
                assert(redeemable === reserve1.address, 'wrong reserve address in event')
                resolve(true)
            })
        })

        // signer 1
        const redeemableERC20_1 = new ethers.Contract(redeemableERC20.address, redeemableERC20.interface, signers[1])
        // signer 2
        const redeemableERC20_2 = new ethers.Contract(redeemableERC20.address, redeemableERC20.interface, signers[2])

        await redeemableERC20.transfer(signers[1].address, TEN_TOKENS)

        // create a few blocks by sending some tokens around, after which redeeming now possible
        while ((await ethers.provider.getBlockNumber()) < (unblockBlock - 1)) {
            await redeemableERC20.transfer(signers[2].address, TEN_TOKENS)
        }

        const redeemableSignerBalanceBefore = await redeemableERC20.balanceOf(signers[1].address);

        const redeemAmount = FIVE_TOKENS;

        // should succeed, despite emitting redeem fail event for one redeemable
        await redeemableERC20_1.redeem(redeemAmount)

        const redeemableSignerBalanceAfter = await redeemableERC20.balanceOf(signers[1].address);

        assert(
            redeemableSignerBalanceBefore.sub(redeemableSignerBalanceAfter).eq(redeemAmount),
            "wrong number of redeemable tokens redeemed"
        )

        assert(
            (await reserve1.balanceOf(signers[1].address)).eq(0),
            "reserve 1 transferred tokens to signer 1 upon redemption, despite being blacklisted"
        );

        const reserve2Balance = await reserve2.balanceOf(signers[1].address)
        assert(
            !(reserve2Balance).eq(0),
            `reserve 2 didn't transfer tokens to signer 1 upon redemption. Reserve 2: ${reserve2.address}, Signer: ${signers[1].address}, Balance: ${reserve2Balance}`
        );
    })

    it('should prevent sending redeemable tokens to zero address', async function () {
        this.timeout(0)

        const TEN_TOKENS = ethers.BigNumber.from('10' + Util.eighteenZeros);

        const signers = await ethers.getSigners()

        const prestigeFactory = await ethers.getContractFactory(
            'Prestige'
        )
        const prestige = await prestigeFactory.deploy() as Prestige

        const minimumStatus = Status.NIL

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
                prestige: prestige.address,
                minimumStatus: minimumStatus,
                totalSupply: totalSupply,
            }
        )

        await redeemableERC20.deployed()
        await redeemableERC20.ownerSetUnblockBlock(unblockBlock)

        await Util.assertError(
            async () => await redeemableERC20.transfer(ethers.constants.AddressZero, TEN_TOKENS),
            "revert ERC20: transfer to the zero address",
            "owner sending redeemable tokens to zero address did not error"
        )

        await redeemableERC20.transfer(signers[1].address, TEN_TOKENS)

        const redeemableERC20_1 = new ethers.Contract(redeemableERC20.address, redeemableERC20.interface, signers[1])

        await Util.assertError(
            async () => await redeemableERC20_1.transfer(ethers.constants.AddressZero, TEN_TOKENS),
            "revert ERC20: transfer to the zero address",
            "signer 1 sending redeemable tokens to zero address did not error"
        )
    })
})