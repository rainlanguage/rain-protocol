import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { Prestige } from '../typechain/Prestige'
import type { PrestigeByConstructionTest } from '../typechain/PrestigeByConstructionTest'

chai.use(solidity)
const { expect, assert } = chai

describe("PrestigeByConstruction", async function() {
    let owner: any;
    let prestigeByConstructionFactory: any;
    let prestige: Prestige;
    let prestigeByConstruction: PrestigeByConstructionTest;
    

    before(async () => {    
        [owner] = await ethers.getSigners()

        const prestigeFactory = await ethers.getContractFactory(
            'Prestige'
        )
        prestige = await prestigeFactory.deploy() as Prestige
        await prestige.deployed()

        prestigeByConstructionFactory = await ethers.getContractFactory(
            'PrestigeByConstructionTest'
        )
        prestigeByConstruction = await prestigeByConstructionFactory.deploy(prestige.address) as PrestigeByConstructionTest
        await prestigeByConstruction.deployed()
    });


    it("should return the parameters entered in the constructor", async function() {
        const now = await ethers.provider.getBlockNumber()
        const constructionBlock = await prestigeByConstruction.constructionBlock();

        assert(
            constructionBlock.eq(now)
        )

        assert(
            prestige.address === await prestigeByConstruction.prestige()
        )
    });


    it ("should return false if isStatus is queried with a wrong status than the current status", async function() {
        assert(
            !(await prestigeByConstruction.isStatus(owner.address, 4))
        )
    });


    it("should be able to use unlimited access functions in any status", async function() {
        assert(await prestigeByConstruction.isStatus(owner.address, 0))
            
        await prestigeByConstruction.unlimited()
    });


    it("should enter a function restricted to Nil status if the status has never been updated", async function() {
        assert(await prestigeByConstruction.isStatus(owner.address, 0))

        await prestigeByConstruction.ifNil()
    });


    it("should fail if you try to enter a function of a specific status if it has never been updated", async function() {
        assert(await prestigeByConstruction.isStatus(owner.address, 0))

        try {
            await prestigeByConstruction.ifGold()
        } catch (e) {
            assert(e.message.toString().includes('revert ERR_MIN_STATUS'))
        }
    });


    it("shouldn't you set to use a function of the new status after construction", async function() {
        await prestige.setStatus(owner.address, 1, [])

        await prestigeByConstruction.unlimited()

        await prestigeByConstruction.ifNil()

        // Setting the status AFTER construction doesn't help.
        try {
            await prestigeByConstruction.ifCopper()
        } catch(e) {
            assert(e.toString().includes('revert ERR_MIN_STATUS'))
        }
    });


    it("should be able to use unlimited functions and lower status than the upgraded one", async function() {
        prestigeByConstruction = await prestigeByConstructionFactory.deploy(prestige.address) as PrestigeByConstructionTest

        await prestigeByConstruction.deployed()

        await prestigeByConstruction.unlimited()

        await prestigeByConstruction.ifNil()

        await prestigeByConstruction.ifCopper()
    });


    it("should not be able to use a function for a status if you do not have that status", async function() {
        try {
            await prestigeByConstruction.ifBronze()
        } catch(e) {
            assert(e.toString().includes('revert ERR_MIN_STATUS'))
        }
    });


    it("should be possible to use all functions restricted to the lower status of the highest status", async function () {
        await prestige.setStatus(owner.address, 8, [])

        prestigeByConstruction = await prestigeByConstructionFactory.deploy(prestige.address) as PrestigeByConstructionTest

        await prestigeByConstruction.deployed()

        await prestigeByConstruction.unlimited()

        await prestigeByConstruction.ifNil()

        await prestigeByConstruction.ifCopper()

        await prestigeByConstruction.ifBronze()

        await prestigeByConstruction.ifJawad()
    });
})