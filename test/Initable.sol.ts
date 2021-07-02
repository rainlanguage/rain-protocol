import chai, { util } from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { InitableTest } from '../typechain/InitableTest'
import * as Util from './Util'

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
        await Util.assertError(
            async () => await initable.afterInit(),
            `revert ONLY_INIT`,
            `after init succeeded before init`,
        )

        await expect(initable.init()).to.emit(initable, 'Initialized')

        // can inspect the initialized state
        assert(await initable.initialized(), 'failed to initialize')

        // beforeInit must error now that we init
        await Util.assertError(
            async () => await initable.beforeInit(),
            `revert ONLY_NOT_INIT`,
            `before init succeeded after init`,
        )

        // afterInit must not error now
        await initable.afterInit()

        // whenever can be called whenever
        await initable.whenever()

        // init must not be able to call a second time
        await Util.assertError(
            async () => await initable.init(),
            `revert ONLY_NOT_INIT`,
            `init twice`,
        )
    })
})