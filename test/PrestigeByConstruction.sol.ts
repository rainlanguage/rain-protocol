import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import { IPrestige } from '../typechain/IPrestige'
import type { Prestige } from '../typechain/Prestige'
import type { PrestigeByConstructionTest, PrestigeByConstructionTestInterface } from '../typechain/PrestigeByConstructionTest'

chai.use(solidity)
const { expect, assert } = chai

describe("PrestigeByConstruction", async function() {
    it("should be prestige lockable", async function() {
        this.timeout(0)

        const signers = await ethers.getSigners()

        const prestigeFactory = await ethers.getContractFactory(
            'Prestige'
        )

        const prestige = await prestigeFactory.deploy() as Prestige

        await prestige.deployed()

        const prestigeByConstructionFactory = await ethers.getContractFactory(
            'PrestigeByConstructionTest'
        )

        const prestigeByConstruction = await prestigeByConstructionFactory.deploy(prestige.address) as PrestigeByConstructionTest

        await prestigeByConstruction.deployed()

        const now = await ethers.provider.getBlockNumber()
        const constructionBlock = await prestigeByConstruction.constructionBlock();

        assert(
            constructionBlock.eq(now)
        )

        assert(
            prestige.address === await prestigeByConstruction.prestige()
        )

        assert(
            (await prestige.statusReport(signers[0].address))
                .eq(ethers.BigNumber.from('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'))
        )

        await prestigeByConstruction.unlimited()

        await prestigeByConstruction.ifNil()

        let ifCopperDidError = false
        try {
            await prestigeByConstruction.ifCopper()
        } catch(e) {
            assert(e.toString().includes('revert ERR_MIN_STATUS'))
            ifCopperDidError = true
        }
        assert(ifCopperDidError, 'did not error when user did not have copper')

        await prestige.setStatus(signers[0].address, 1, [])

        await prestigeByConstruction.unlimited()

        await prestigeByConstruction.ifNil()

        // Setting the status AFTER construction doesn't help.
        let ifCopperLateDidError = false
        try {
            await prestigeByConstruction.ifCopper()
        } catch(e) {
            assert(e.toString().includes('revert ERR_MIN_STATUS'))
            ifCopperLateDidError = true
        }
        assert(ifCopperLateDidError, 'did not error when the user upgraded copper after the construction')

        const prestigeByConstruction2 = await prestigeByConstructionFactory.deploy(prestige.address) as PrestigeByConstructionTest

        await prestigeByConstruction2.deployed()

        await prestigeByConstruction2.unlimited()

        await prestigeByConstruction2.ifNil()

        await prestigeByConstruction2.ifCopper()

        let ifBronzeDidError = false
        try {
            await prestigeByConstruction2.ifBronze()
        } catch(e) {
            assert(e.toString().includes('revert ERR_MIN_STATUS'))
            ifBronzeDidError = true
        }
        assert(ifBronzeDidError, 'did not error for bronze')

        await prestige.setStatus(signers[0].address, 2, [])

        await prestigeByConstruction2.unlimited()

        await prestigeByConstruction2.ifNil()

        await prestigeByConstruction2.ifCopper()

        let ifBronzeLateDidError = false
        try {
            await prestigeByConstruction2.ifBronze()
        } catch(e) {
            assert(e.toString().includes('revert ERR_MIN_STATUS'))
            ifBronzeLateDidError = true
        }
        assert(ifBronzeLateDidError, 'did not error when the user upgraded bronze after the construction')

        const prestigeByConstruction3 = await prestigeByConstructionFactory.deploy(prestige.address) as PrestigeByConstructionTest

        await prestigeByConstruction3.deployed()

        await prestigeByConstruction3.unlimited()

        await prestigeByConstruction3.ifNil()

        await prestigeByConstruction3.ifCopper()

        await prestigeByConstruction3.ifBronze()

        let ifSilverDidError = false
        try {
            await prestigeByConstruction3.ifSilver()
        } catch(e) {
            assert(e.toString().includes('revert ERR_MIN_STATUS'))
            ifSilverDidError = true
        }
        assert(ifSilverDidError, 'did not error for silver')

        await prestige.setStatus(signers[0].address, 8, [])

        const prestigeByConstruction4 = await prestigeByConstructionFactory.deploy(prestige.address) as PrestigeByConstructionTest

        await prestigeByConstruction4.deployed()

        await prestigeByConstruction4.unlimited()

        await prestigeByConstruction4.ifNil()

        await prestigeByConstruction4.ifCopper()

        await prestigeByConstruction4.ifBronze()

        await prestigeByConstruction4.ifJawad()

    })
})