import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { Tier } from '../typechain/Tier'
import type { TierByConstructionTest } from '../typechain/TierByConstructionTest'
import type { TierByConstructionClaimTest } from '../typechain/TierByConstructionClaimTest'
import { assertError } from '../utils/status-report'


chai.use(solidity)
const { expect, assert } = chai

describe("TierByConstruction", async function() {
    let owner: any;
    let prestigeByConstructionFactory: any;
    let tier: Tier;
    let tierByConstruction: TierByConstructionTest;

    before(async () => {
        [owner] = await ethers.getSigners()

        const tierFactory = await ethers.getContractFactory(
            'tier'
        )
        tier = await tierFactory.deploy() as Tier
        await tier.deployed()

        const tierByConstructionFactory = await ethers.getContractFactory(
            'TierByConstructionTest'
        )
        tierByConstruction = await tierByConstructionFactory.deploy(tier.address) as TierByConstructionTest
        await tierByConstruction.deployed()
    });


    it("should return the parameters entered in the constructor", async function() {
        const now = await ethers.provider.getBlockNumber()
        const constructionBlock = await tierByConstruction.constructionBlock();

        assert(
            constructionBlock.eq(now)
        )

        assert(
            tier.address === await tierByConstruction.tier()
        )
    });


    it ("should return false if isStatus is queried with a wrong status than the current status", async function() {
        assert(
            !(await tierByConstruction.isStatus(owner.address, 4))
        )
    });


    it("should be able to use unlimited access functions in any status", async function() {
        assert(await tierByConstruction.isStatus(owner.address, 0))

        await tierByConstruction.unlimited()
    });


    it("should enter a function restricted to Nil status if the status has never been updated", async function() {
        assert(await tierByConstruction.isStatus(owner.address, 0))

        await tierByConstruction.ifNil()
    });


    it("should fail if you try to enter a function of a specific status if it has never been updated", async function() {
        assert(await tierByConstruction.isStatus(owner.address, 0))

        assertError(
            async () => await tierByConstruction.ifGold(),
            'revert ERR_MIN_STATUS',
            'did not make a mistake when the user entered gold when he did not have it'
        )
    });


    it("shouldn't you set to use a function of the new status after construction", async function() {
        await tier.setStatus(owner.address, 1, [])

        await tierByConstruction.unlimited()

        await tierByConstruction.ifNil()

        // Setting the status AFTER construction doesn't help.
        assertError(
            async () => await tierByConstruction.ifCopper(),
            'revert ERR_MIN_STATUS',
            'did not make a mistake when the user upgraded the copper after construction'
        )
    });


    it("should be able to use unlimited functions and lower status than the upgraded one", async function() {
        tierByConstruction = await tierByConstructionFactory.deploy(tier.address) as TierByConstructionTest

        await tierByConstruction.deployed()

        await tierByConstruction.unlimited()

        await tierByConstruction.ifNil()

        await tierByConstruction.ifCopper()
    });


    it("should not be able to use a function for a status if you do not have that status", async function() {
        assertError(
            async () => await tierByConstruction.ifBronze(),
            'revert ERR_MIN_STATUS',
            'did not make a mistake when the user entered bronze when he did not have it.'
        )
    });


    it("should be possible to use all functions restricted to the lower status of the highest status", async function () {
        await tier.setStatus(owner.address, 8, [])

        tierByConstruction = await tierByConstructionFactory.deploy(tier.address) as TierByConstructionTest

        await tierByConstruction.deployed()

        await tierByConstruction.unlimited()

        await tierByConstruction.ifNil()

        await tierByConstruction.ifCopper()

        await tierByConstruction.ifBronze()

        await tierByConstruction.ifJawad()
    });


    it("should enter the functions of the previous state when downgrading after construction", async function () {
        tierByConstruction = await tierByConstructionFactory.deploy(tier.address) as TierByConstructionTest
        await tierByConstruction.deployed()

        await tier.setStatus(owner.address, 6, [])

        await tierByConstruction.unlimited()

        await tierByConstruction.ifNil()

        await tierByConstruction.ifCopper()

        await tierByConstruction.ifBronze()

        await tierByConstruction.ifDiamond()

    });


    it("Should not enter the functions of the former state when downgrading after construction", async function () {
        tierByConstruction = await tierByConstructionFactory.deploy(tier.address) as TierByConstructionTest
        await tierByConstruction.deployed()

        await tier.setStatus(owner.address, 3, [])

        await tierByConstruction.unlimited()

        await tierByConstruction.ifNil()

        await tierByConstruction.ifCopper()

        assertError(
            async () => await tierByConstruction.ifDiamond(),
            'revert ERR_MIN_STATUS',
            'did not make a mistake when the user entered dimond when he did not have it.'
        )
    });
});


describe("TierByConstructionClaim", async function() {
    let owner: any;
    let tier: Tier;
    let tierByConstructionClaim: TierByConstructionClaimTest;
    let tierByConstructionClaimFactory: any;


    before(async () => {
        [owner] = await ethers.getSigners()

        const tierFactory = await ethers.getContractFactory(
            'tier'
        )
        tier = await tierFactory.deploy() as tier
        await tier.deployed()

        tierByConstructionClaimFactory = await ethers.getContractFactory(
            'TierByConstructionClaimTest'
        )
        tierByConstructionClaim = await tierByConstructionClaimFactory.deploy(tier.address) as TierByConstructionClaimTest
        await tierByConstructionClaim.deployed()
    });


    it("shouldn't you set to use a function of the new status after construction", async function() {
        await tier.setStatus(owner.address, 4, [])

        assertError(
            async () => await tierByConstructionClaim.claim(owner.address),
            'revert ERR_MIN_STATUS',
            'did not make a mistake when the user upgraded the gold after construction'
        )
    });


    it("should enter the function and mint 100 tokens", async function() {
        tierByConstructionClaim = await tierByConstructionClaimFactory.deploy(tier.address) as TierByConstructionClaimTest
        await tierByConstructionClaim.deployed()

        await tierByConstructionClaim.claim(owner.address)

        assert(
            (await tierByConstructionClaim.claims(owner.address)),
            "did not enter correctly to the function"
        )

        assert(
            Number(await tierByConstructionClaim.balanceOf(owner.address)) === 100,
            "did not enter correctly to the function"
        )
    });


    it("should not allow multiple minting", async function() {
        assertError(
            async() => await tierByConstructionClaim.claim(owner.address),
            'revert ERR_MULTI_MINT',
            'function does not correctly restrict multiple mints'
        )
    });
});