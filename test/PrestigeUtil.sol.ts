import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { Prestige } from '../typechain/Prestige'
// import type { PrestigeByConstructionTest } from '../typechain/PrestigeByConstructionTest'
// import type { PrestigeByConstructionClaimTest } from '../typechain/PrestigeByConstructionClaimTest'


chai.use(solidity)
const { expect, assert } = chai

describe("PrestigeByConstruction", async function() {
    let owner: any;
    let prestigeByConstructionFactory: any;
    let prestige: Prestige;
    //let prestigeByConstruction: PrestigeByConstructionTest;


    before(async () => {
        [owner] = await ethers.getSigners()

        const prestigeFactory = await ethers.getContractFactory(
            'Prestige'
        )
        prestige = await prestigeFactory.deploy() as Prestige
        await prestige.deployed()

        // prestigeByConstructionFactory = await ethers.getContractFactory(
        //     'PrestigeByConstructionTest'
        // )
        // prestigeByConstruction = await prestigeByConstructionFactory.deploy(prestige.address) as PrestigeByConstructionTest
        // await prestigeByConstruction.deployed()
    });

});