import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { InitableTest } from '../typechain/InitableTest'

chai.use(solidity)
const { expect, assert } = chai

describe("Initable", async function () {
    it("should init once", async function () {
        this.timeout(0)

        const signers = await ethers.getSigners()

        const initableFactory = await ethers.getContractFactory(
            'InitableTest'
        )

        // Still need to deploy before initing.
        const initable = await initableFactory.deploy() as InitableTest

        await initable.deployed()

        // can inspect the initialized state
        assert(!await initable.initialized(), 'initialized early')

        // beforeInit must not error before we init
        await initable.beforeInit()

        // whenever can be called whenever
        await initable.whenever()

        // afterInit must error before we init
        let afterInitBeforeDidError = false
        try {
            await initable.afterInit()
        } catch (e) {
            assert(e.toString().includes('revert ERR_ONLY_INIT'), 'after init succeeded before init')
            afterInitBeforeDidError = true
        }
        assert(afterInitBeforeDidError)

        const initialized = new Promise(resolve => {
            initable.once('Initialized', resolve)
        })
        await initable.init()
        await initialized

        // can inspect the initialized state
        assert(await initable.initialized(), 'failed to initialize')

        // beforeInit must error now that we init
        let beforeInitAfterDidError = false
        try {
            await initable.beforeInit()
        } catch (e) {
            assert(e.toString().includes('revert ERR_ONLY_NOT_INIT'), 'before init succeeded after init')
            beforeInitAfterDidError = true
        }
        assert(beforeInitAfterDidError)

        // afterInit must not error now
        await initable.afterInit()

        // whenever can be called whenever
        await initable.whenever()

        // init must not be able to call a second time
        let initAgainDidError = false
        try {
            await initable.init()
        } catch (e) {
            assert(e.toString().includes('revert ERR_ONLY_NOT_INIT'), 'init twice')
            initAgainDidError = true
        }
        assert(initAgainDidError)
    })
})