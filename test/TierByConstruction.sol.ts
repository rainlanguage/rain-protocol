import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { ReadWriteTier } from '../typechain/ReadWriteTier'
import type { TierByConstructionTest } from '../typechain/TierByConstructionTest'
import type { TierByConstructionClaimTest } from '../typechain/TierByConstructionClaimTest'
import { assertError } from '../utils/status-report'


chai.use(solidity)
const { expect, assert } = chai

describe("TierByConstruction", async function() {
    let owner: any;
    let tierByConstructionFactory: any;
    let readWriteTier: ReadWriteTier;
    let tierByConstruction: TierByConstructionTest;

    before(async () => {
        [owner] = await ethers.getSigners()

        const tierFactory = await ethers.getContractFactory(
            'ReadWriteTier'
        )
        readWriteTier = await tierFactory.deploy() as ReadWriteTier
        await readWriteTier.deployed()

        tierByConstructionFactory = await ethers.getContractFactory(
            'TierByConstructionTest'
        )
        tierByConstruction = await tierByConstructionFactory.deploy(readWriteTier.address) as TierByConstructionTest
        await tierByConstruction.deployed()
    });


    it("should return the parameters entered in the constructor", async function() {
        const now = await ethers.provider.getBlockNumber()
        const constructionBlock = await tierByConstruction.constructionBlock();

        assert(
            constructionBlock.eq(now)
        )

        assert(
            readWriteTier.address === await tierByConstruction.tierContract()
        )
    });


    it ("should return false if isTier is queried with a wrong tier than the current tier", async function() {
        assert(
            !(await tierByConstruction.isTier(owner.address, 4))
        )
    });


    it("should be able to use unlimited access functions in any tier", async function() {
        assert(await tierByConstruction.isTier(owner.address, 0))

        await tierByConstruction.unlimited()
    });


    it("should enter a function restricted to Zero status if the tier has never been set", async function() {
        assert(await tierByConstruction.isTier(owner.address, 0))

        await tierByConstruction.ifZero()
    });


    it("should fail if you try to enter a function of a specific tier if it has never been set", async function() {
        assert(await tierByConstruction.isTier(owner.address, 0))

        assertError(
            async () => await tierByConstruction.ifFour(),
            'revert ERR_MINIMUM_TIER',
            'did not make a mistake when the user entered FOUR when he did not have it'
        )
    });


    it("shouldn't you set to use a function of the new tier after construction", async function() {
        await readWriteTier.setTier(owner.address, 1, [])

        await tierByConstruction.unlimited()

        await tierByConstruction.ifZero()

        // Setting the status AFTER construction doesn't help.
        assertError(
            async () => await tierByConstruction.ifOne(),
            'revert ERR_MINIMUM_TIER',
            'did not make a mistake when the user upgraded the copper after construction'
        )
    });


    it("should be able to use unlimited functions and lower tier than the upgraded one", async function() {
        tierByConstruction = await tierByConstructionFactory.deploy(readWriteTier.address) as TierByConstructionTest

        await tierByConstruction.deployed()

        await tierByConstruction.unlimited()

        await tierByConstruction.ifZero()

        await tierByConstruction.ifOne()
    });


    it("should not be able to use a function for a tier if you do not have that tier", async function() {
        assertError(
            async () => await tierByConstruction.ifTwo(),
            'revert ERR_MINIMUM_TIER',
            'did not make a mistake when the user entered TWO when he did not have it.'
        )
    });


    it("should be possible to use all functions restricted to the lower tier of the highest status", async function () {
        await readWriteTier.setTier(owner.address, 8, [])

        tierByConstruction = await tierByConstructionFactory.deploy(readWriteTier.address) as TierByConstructionTest

        await tierByConstruction.deployed()

        await tierByConstruction.unlimited()

        await tierByConstruction.ifZero()

        await tierByConstruction.ifOne()

        await tierByConstruction.ifTwo()

        await tierByConstruction.ifEight()
    });


    it("should enter the functions of the previous tier when downgrading after construction", async function () {
        tierByConstruction = await tierByConstructionFactory.deploy(readWriteTier.address) as TierByConstructionTest
        await tierByConstruction.deployed()

        await readWriteTier.setTier(owner.address, 6, [])

        await tierByConstruction.unlimited()

        await tierByConstruction.ifZero()

        await tierByConstruction.ifOne()

        await tierByConstruction.ifTwo()

        await tierByConstruction.ifSix()

    });


    it("Should not enter the functions of the former state when downgrading after construction", async function () {
        tierByConstruction = await tierByConstructionFactory.deploy(readWriteTier.address) as TierByConstructionTest
        await tierByConstruction.deployed()

        await readWriteTier.setTier(owner.address, 3, [])

        await tierByConstruction.unlimited()

        await tierByConstruction.ifZero()

        await tierByConstruction.ifOne()

        assertError(
            async () => await tierByConstruction.ifSix(),
            'revert ERR_MINIMUM_TIER',
            'did not make a mistake when the user entered dimond when he did not have it.'
        )
    });
});


describe("TierByConstructionClaim", async function() {
    let owner: any;
    let readWriteTier: ReadWriteTier;
    let tierByConstructionClaim: TierByConstructionClaimTest;
    let tierByConstructionClaimFactory: any;


    before(async () => {
        [owner] = await ethers.getSigners()

        const tierFactory = await ethers.getContractFactory(
            'ReadWriteTier'
        )
        readWriteTier = await tierFactory.deploy() as ReadWriteTier
        await readWriteTier.deployed()

        tierByConstructionClaimFactory = await ethers.getContractFactory(
            'TierByConstructionClaimTest'
        )
        tierByConstructionClaim = await tierByConstructionClaimFactory.deploy(readWriteTier.address) as TierByConstructionClaimTest
        await tierByConstructionClaim.deployed()
    });


    it("shouldn't you set to use a function of the new tier after construction", async function() {
        await readWriteTier.setTier(owner.address, 4, [])

        assertError(
            async () => await tierByConstructionClaim.claim(owner.address),
            'revert ERR_MINIMUM_TIER',
            'did not make a mistake when the user upgraded the FOUR after construction'
        )
    });


    it("should enter the function and mint 100 tokens", async function() {
        tierByConstructionClaim = await tierByConstructionClaimFactory.deploy(readWriteTier.address) as TierByConstructionClaimTest
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