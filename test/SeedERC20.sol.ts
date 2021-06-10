import * as Util from './Util'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { ReserveToken } from '../typechain/ReserveToken'
import type { SeedERC20 } from '../typechain/SeedERC20'

chai.use(solidity)
const { expect, assert } = chai

describe("SeedERC20", async function () {
    it("should work on the happy path", async function() {
        const signers = await ethers.getSigners()
        const alice = signers[0]
        const bob = signers[1]
        const carol = signers[2]
        const dave = signers[3]

        const reserve = await Util.basicDeploy("ReserveToken", {}) as ReserveToken

        const aliceReserve = reserve.connect(alice)
        const bobReserve = reserve.connect(bob)
        const carolReserve = reserve.connect(carol)
        const daveReserve = reserve.connect(dave)

        const seedPrice = 100
        const seedUnits = 10
        const unseedDelay = 0

        const bobUnits = 6
        const carolUnits = 4

        const seedERC20Factory = await ethers.getContractFactory(
            'SeedERC20'
        )
        const seedERC20 = await seedERC20Factory.deploy({
            reserve: reserve.address,
            seedPrice: seedPrice,
            seedUnits: seedUnits,
            unseedDelay: unseedDelay,
            name: 'seed',
            symbol: 'SD',
        }) as SeedERC20

        const aliceSeed = seedERC20.connect(alice)
        const bobSeed = seedERC20.connect(bob)
        const carolSeed = seedERC20.connect(carol)
        const daveSeed = seedERC20.connect(dave)

        assert(
            await seedERC20.reserve() == reserve.address,
            `reserve not set`
        );

        const recipientPreInit = await seedERC20.recipient()
        assert(
            recipientPreInit == '0x0000000000000000000000000000000000000000',
            `recipient set too early ${recipientPreInit}`
        )

        assert(
            (await seedERC20.seedPrice()).eq(seedPrice),
            `seed price not set`
        )

        assert(
            (await seedERC20.totalSupply()).eq(seedUnits),
            `seed total supply is wrong`
        )

        assert(
            (await seedERC20.getUnblockBlock()).eq(0),
            `seeded true too early`
        )

        await seedERC20.init(dave.address)

        assert(
            await seedERC20.recipient() == dave.address,
            `failed to set recipient`
        )

        await aliceReserve.transfer(bob.address, bobUnits * seedPrice)
        await aliceReserve.transfer(carol.address, carolUnits * seedPrice)

        assert(
            (await reserve.balanceOf(bob.address)).eq(bobUnits * seedPrice),
            `failed to send reserve to bob`
        )
        assert(
            (await seedERC20.balanceOf(bob.address)).eq(0),
            `bob did not start with zero seed erc20`
        )

        // Bob and carol co-fund the seed round.

        await bobReserve.approve(seedERC20.address, bobUnits * seedPrice)
        await bobSeed.seed(bobUnits)
        await bobSeed.unseed(2)

        await bobReserve.approve(seedERC20.address, 2 * seedPrice)
        await bobSeed.seed(2)

        await carolReserve.approve(seedERC20.address, carolUnits * seedPrice)
        await carolSeed.seed(carolUnits)

        const seededBlock = await ethers.provider.getBlockNumber()

        assert((await seedERC20.getUnblockBlock()).eq(seededBlock), `failed to set seeded`)

        // Dave takes out his reserve.

        await daveReserve.transferFrom(seedERC20.address, dave.address, seedUnits * seedPrice)

        // Dave gets 10% extra reserve from somewhere.

        await aliceReserve.transfer(dave.address, seedPrice * seedUnits * 0.1)

        // Dave sends reserve back to the seed contract.

        await daveReserve.transfer(seedERC20.address, await daveReserve.balanceOf(dave.address))

        // Bob and carol can redeem their seed tokens.
        await bobSeed.redeem(bobUnits)
        await carolSeed.redeem(carolUnits)

        const bobFinalBalance = await bobReserve.balanceOf(bob.address)
        const carolFinalBalance = await carolReserve.balanceOf(carol.address)

        // bob and carol should have 10% more reserve than they put in after redemption.
        assert(bobFinalBalance.eq(660), `Wrong final balance for bob ${bobFinalBalance}`)
        assert(carolFinalBalance.eq(440), `Wrong final balance for carol ${carolFinalBalance}`)
    })
})