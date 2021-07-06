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

enum Phase {
    ZERO,
    ONE,
    TWO,
    THREE,
    FOUR,
    FIVE,
    SIX,
    SEVEN,
    EIGHT
}

describe("RedeemableERC20", async function () {
    it('should allow receiver/send to always receive/send tokens if added via ownerAddReceiver/ownerAddSender, bypassing BlockBlockable restrictions', async function () {
        const TEN_TOKENS = ethers.BigNumber.from('10' + Util.eighteenZeros);

        const signers = await ethers.getSigners()

        const owner = signers[0]
        const sender = signers[1]
        const receiver = signers[2]

        const reserve = await Util.basicDeploy("ReserveToken", {}) as ReserveToken

        // Constructing the RedeemableERC20 sets the parameters but nothing stateful happens.

        const prestigeFactory = await ethers.getContractFactory(
            'Prestige'
        )
        const prestige = await prestigeFactory.deploy() as Prestige
        const minimumStatus = Status.GOLD

        await prestige.setStatus(sender.address, Status.COPPER, [])
        await prestige.setStatus(receiver.address, Status.COPPER, [])

        const redeemableERC20Factory = await ethers.getContractFactory(
            'RedeemableERC20'
        )
        const tokenName = 'RedeemableERC20'
        const tokenSymbol = 'RDX'
        const totalSupply = ethers.BigNumber.from('5000' + Util.eighteenZeros)

        const now = await ethers.provider.getBlockNumber()
        const unblockBlock = now + 10

        const token = await redeemableERC20Factory.deploy(
            {
                name: tokenName,
                symbol: tokenSymbol,
                prestige: prestige.address,
                minimumStatus: minimumStatus,
                totalSupply: totalSupply,
            }
        )

        await token.deployed()
        await token.ownerScheduleNextPhase(unblockBlock)

        // try sending/receiving, both with insufficient prestige
        await Util.assertError(
            async () => await token.connect(sender).transfer(receiver.address, 1),
            "revert MIN_STATUS",
            "sender/receiver sent/received tokens despite insufficient prestige status"
        )

        // remove BlockBlockable restrictions for sender and receiver
        await token.ownerAddSender(sender.address)
        assert((await token.isSender(sender.address)), "sender status was wrong")

        await token.ownerAddReceiver(receiver.address)
        assert((await token.isReceiver(receiver.address)), "receiver status was wrong")

        // sender needs tokens (actually needs permission to receive these tokens anyway)
        await token.ownerAddReceiver(sender.address)
        assert((await token.isSender(sender.address)), "sender did not remain sender after also becoming receiver")

        // give some tokens
        await token.transfer(sender.address, TEN_TOKENS)

        // should work now
        await token.connect(sender).transfer(receiver.address, 1)

        let i = 0;
        while ((await ethers.provider.getBlockNumber() < unblockBlock)) {
            await reserve.transfer(signers[9].address, 0)
            i++;
        }
        console.log(`created ${i} empty blocks`);

        // sender and receiver should be unrestricted after unblock block
        await token.connect(sender).transfer(receiver.address, 1)
    })

    it("should prevent tokens being sent to self (when user should be redeeming)", async function () {
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
        await redeemableERC20.ownerScheduleNextPhase(unblockBlock)
        await redeemableERC20.ownerAddRedeemable(reserve.address)

        // create a few blocks by sending some tokens around
        while ((await ethers.provider.getBlockNumber()) < (unblockBlock - 1)) {
            await redeemableERC20.transfer(signers[1].address, 1)
        }

        // pool exits and reserve tokens sent to redeemable ERC20 address
        const reserveTotal = ethers.BigNumber.from('1000' + Util.eighteenZeros)
        await reserve.transfer(redeemableERC20.address, reserveTotal)

        // user attempts to wrongly 'redeem' by sending all of their redeemable tokens directly to contract address
        await Util.assertError(
            async () => await redeemableERC20.transfer(redeemableERC20.address, await redeemableERC20.balanceOf(signers[0].address)),
            "revert TOKEN_SEND_SELF",
            "user successfully transferred all their redeemables tokens to token contract"
        )
    })

    it('should allow filling all slots in redeemables array', async function () {
        this.timeout(0)

        const reserve0 = await Util.basicDeploy("ReserveToken", {}) as ReserveToken
        const reserve1 = await Util.basicDeploy("ReserveToken", {}) as ReserveToken
        const reserve2 = await Util.basicDeploy("ReserveToken", {}) as ReserveToken
        const reserve3 = await Util.basicDeploy("ReserveToken", {}) as ReserveToken
        const reserve4 = await Util.basicDeploy("ReserveToken", {}) as ReserveToken
        const reserve5 = await Util.basicDeploy("ReserveToken", {}) as ReserveToken
        const reserve6 = await Util.basicDeploy("ReserveToken", {}) as ReserveToken
        const reserve7 = await Util.basicDeploy("ReserveToken", {}) as ReserveToken

        const reserves = [reserve0, reserve1, reserve2, reserve3, reserve4, reserve5, reserve6, reserve7]

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
        await redeemableERC20.ownerScheduleNextPhase(unblockBlock)
        await redeemableERC20.ownerAddRedeemable(reserve0.address)
        await redeemableERC20.ownerAddRedeemable(reserve1.address)
        await redeemableERC20.ownerAddRedeemable(reserve2.address)
        await redeemableERC20.ownerAddRedeemable(reserve3.address)
        await redeemableERC20.ownerAddRedeemable(reserve4.address)
        await redeemableERC20.ownerAddRedeemable(reserve5.address)
        await redeemableERC20.ownerAddRedeemable(reserve6.address)
        await redeemableERC20.ownerAddRedeemable(reserve7.address)

        assert(
            (await redeemableERC20.getRedeemables())[0] == reserve0.address,
            `reserve address not set as redeemable in slot 0`
        )
        assert(
            (await redeemableERC20.getRedeemables())[1] == reserve1.address,
            `reserve address not set as redeemable in slot 1`
        )
        assert(
            (await redeemableERC20.getRedeemables())[2] == reserve2.address,
            `reserve address not set as redeemable in slot 2`
        )
        assert(
            (await redeemableERC20.getRedeemables())[3] == reserve3.address,
            `reserve address not set as redeemable in slot 3`
        )
        assert(
            (await redeemableERC20.getRedeemables())[4] == reserve4.address,
            `reserve address not set as redeemable in slot 4`
        )
        assert(
            (await redeemableERC20.getRedeemables())[5] == reserve5.address,
            `reserve address not set as redeemable in slot 5`
        )
        assert(
            (await redeemableERC20.getRedeemables())[6] == reserve6.address,
            `reserve address not set as redeemable in slot 6`
        )
        assert(
            (await redeemableERC20.getRedeemables())[7] == reserve7.address,
            `reserve address not set as redeemable in slot 7`
        )

        const getRedeemablesResult = await redeemableERC20.getRedeemables()

        getRedeemablesResult.every((redeemable, index) => {
            assert(
                redeemable == reserves[index].address,
                `reserve address not set as redeemable in slot ${index} (getRedeemables)`
            )
        })
    })


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
        const phaseOneBlock = now + 8

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

        const nextPhasePromise = redeemableERC20.ownerScheduleNextPhase(phaseOneBlock)

        await expect(nextPhasePromise)
            .to.emit(redeemableERC20, 'PhaseShiftScheduled')
            .withArgs(phaseOneBlock)

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
            (await redeemableERC20.getRedeemables()).length === 8,
            'redeemables length not fixed'
        )

        assert(
            (await redeemableERC20.getRedeemables())[0] == reserve.address,
            `reserve address not set as redeemable`
        )

        // The phase is not set (i.e. contract is blocked)
        assert(
            (await redeemableERC20.currentPhase()) === Phase.ZERO,
            `phase was not ${Phase.ZERO} in construction`
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
            async () => await redeemableERC20.senderRedeem(100),
            'revert BAD_PHASE',
            'redeem did not error'
        )

        // We cannot send to the token address.
        await Util.assertError(
            async () => await redeemableERC20.transfer(redeemableERC20.address, 10),
            'revert TOKEN_SEND_SELF',
            'self send was not blocked'
        )

        // create a few blocks by sending some tokens around
        while ((await ethers.provider.getBlockNumber()) < (phaseOneBlock - 1)) {
            await redeemableERC20.transfer(signers[1].address, 1)
        }

        // Funds need to be frozen once redemption unblocks.
        await Util.assertError(
            async () => await redeemableERC20.transfer(signers[1].address, 1),
            'revert FROZEN',
            'funds were not frozen in next phase'
            )

        assert(
            (await redeemableERC20.currentPhase()) === Phase.ONE,
            `wrong phase, expected ${Phase.ONE} got ${await redeemableERC20.currentPhase()}`
        )

        const redeemableERC202 = new ethers.Contract(redeemableERC20.address, redeemableERC20.interface, signers[1])
        // owner is on the unfreezable list.
        await redeemableERC202.transfer(signers[0].address, 1)

        // but not to anyone else.
        await Util.assertError(
            async () => await redeemableERC20.transfer(signers[2].address, 1),
            'revert FROZEN',
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
        await expect(redeemableERC20.senderRedeem(redeemAmount)).to.emit(redeemableERC20, 'Redeem').withArgs(signers[0].address, reserve.address, [redeemAmount, expectedReserveRedemption])

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
            async () => await redeemableERC20.senderRedeem(ethers.BigNumber.from('10000' + Util.eighteenZeros)),
            'revert ERC20: burn amount exceeds balance',
            'failed to stop greedy redeem',
        )

        // check math for more redemptions
        {
            let i = 0
            const expectedDiff = '10000000000000000000'
            while (i < 3) {
                console.log(`redemption check 1: ${i}`)
                const balanceBefore = await reserve.balanceOf(signers[0].address)
                await expect(redeemableERC20.senderRedeem(redeemAmount)).to.emit(redeemableERC20, 'Redeem').withArgs(signers[0].address, reserve.address, [redeemAmount, expectedDiff])
                const balanceAfter = await reserve.balanceOf(signers[0].address)
                const diff = balanceAfter.sub(balanceBefore)
                assert(diff.eq(expectedDiff), `wrong diff ${i} ${expectedDiff} ${diff} ${balanceBefore} ${balanceAfter}`)
                i++
            }
        }

        {
            // Things dynamically recalculate if we dump more reserve back in the token contract
            await reserve.transfer(redeemableERC20.address, ethers.BigNumber.from('20' + Util.eighteenZeros))

            let i = 0
            const expectedDiff = '10208333333333333333'

            while (i < 3) {
                console.log(`redemption check 2: ${i}`)
                const balanceBefore = await reserve.balanceOf(signers[0].address)
                await expect(redeemableERC20.senderRedeem(redeemAmount)).to.emit(redeemableERC20, 'Redeem').withArgs(signers[0].address, reserve.address, [redeemAmount, expectedDiff])
                const balanceAfter = await reserve.balanceOf(signers[0].address)
                const diff = balanceAfter.sub(balanceBefore)
                assert(diff.eq(expectedDiff), `wrong diff ${i} ${expectedDiff} ${diff} ${balanceBefore} ${balanceAfter}`)
                i++
            }
        }
    })

    it("should only allow owner to set phase blocks", async function () {
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
        const phaseOneBlock = now + 8

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

        assert((await redeemableERC20.currentPhase()) === Phase.ZERO, "default phase was not zero")

        const redeemableERC201 = new ethers.Contract(redeemableERC20.address, redeemableERC20.interface, signers[1])

        await Util.assertError(
            async () => await redeemableERC201.ownerScheduleNextPhase(phaseOneBlock),
            "revert Ownable: caller is not the owner",
            "non-owner was wrongly able to set phase block"
        )

        await redeemableERC20.ownerScheduleNextPhase(phaseOneBlock)
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
        await redeemableERC20.ownerScheduleNextPhase(unblockBlock)

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
        await redeemableERC20.ownerScheduleNextPhase(unblockBlock)

        const redeemableERC20_SILVER = new ethers.Contract(redeemableERC20.address, redeemableERC20.interface, signers[2])
        await Util.assertError(
            async () => await redeemableERC20.transfer(signers[2].address, 1),
            "revert MIN_STATUS",
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
        await redeemableERC20.senderRedeem(1)

        // There is no way the SILVER user can receive tokens so they also cannot redeem tokens.
        await Util.assertError(
            async () => await redeemableERC20_SILVER.senderRedeem(1),
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
        await redeemableERC20.ownerScheduleNextPhase(unblockBlock)
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
        await expect(redeemableERC20_1.senderRedeem(redeemAmount)).to.emit(redeemableERC20_1, 'Redeem').withArgs(signers[1].address, reserve1.address, [redeemAmount, expectedReserve1Redemption])

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

    it('should allow specific redeeming of other redeemables when a redeemable transfer fails', async function () {
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
        await redeemableERC20.ownerScheduleNextPhase(unblockBlock)
        await redeemableERC20.ownerAddRedeemable(reserve1.address)
        await redeemableERC20.ownerAddRedeemable(reserve2.address)

        await reserve2.transfer(redeemableERC20.address, await reserve2.totalSupply())

        // reserve 1 blacklists signer 1. Signer 1 cannot receive reserve 1 upon redeeming contract tokens
        reserve1.ownerAddFreezable(signers[1].address)

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
        await Util.assertError(
            async () => await redeemableERC20_1.senderRedeem(redeemAmount),
            `revert FROZEN`,
            `failed to error when reserve is frozen`,
        )

        await redeemableERC20_1.senderRedeemSpecific([reserve2.address], redeemAmount)

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
        await redeemableERC20.ownerScheduleNextPhase(unblockBlock)

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