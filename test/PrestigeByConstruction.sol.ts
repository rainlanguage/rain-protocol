import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import { IPrestige } from '../typechain/IPrestige'
import type { Prestige } from '../typechain/Prestige'
import type { PrestigeByConstructionTest } from '../typechain/PrestigeByConstructionTest'

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

        console.log(await prestige.statusReport(signers[0].address))

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

        let ifSilverDidError = false
        try {
            await prestigeByConstruction2.ifSilver()
        } catch(e) {
            assert(e.toString().includes('revert ERR_MIN_STATUS'))
            ifSilverDidError = true
        }
        assert(ifSilverDidError, 'did not error for silver')

        await prestige.setStatus(signers[0].address, 2, [])

        await prestigeByConstruction2.unlimited()

        await prestigeByConstruction2.ifNil()

        await prestigeByConstruction2.ifCopper()

        let ifSilverLateDidError = false
        try {
            await prestigeByConstruction2.ifSilver()
        } catch(e) {
            assert(e.toString().includes('revert ERR_MIN_STATUS'))
            ifSilverLateDidError = true
        }
        assert(ifSilverLateDidError, 'did not error when the user upgraded silver after the construction')

    })
})