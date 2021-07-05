import * as Util from './Util'
import chai, { util } from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { ReserveToken } from '../typechain/ReserveToken'
import type { ConfigurableRightsPool } from '../typechain/ConfigurableRightsPool'
import type { RedeemableERC20Pool } from '../typechain/RedeemableERC20Pool'
import type { Prestige } from '../typechain/Prestige'
import { recoverAddress } from '@ethersproject/transactions'

chai.use(solidity)
const { expect, assert } = chai

const trustJson = require('../artifacts/contracts/Trust.sol/Trust.json')
const poolJson = require('../artifacts/contracts/RedeemableERC20Pool.sol/RedeemableERC20Pool.json')
const reserveJson = require('../artifacts/contracts/test/ReserveToken.sol/ReserveToken.json')
const redeemableTokenJson = require('../artifacts/contracts/RedeemableERC20.sol/RedeemableERC20.json')

describe("RedeemableERC20Pool", async function () {
    it('should transfer all raised funds to owner on pool exit', async () => {
        this.timeout(0)

        const signers = await ethers.getSigners()

        const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy()

        const reserve = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

        const prestigeFactory = await ethers.getContractFactory(
            'Prestige'
        )
        const prestige = await prestigeFactory.deploy() as Prestige
        const minimumStatus = 0

        const redeemableFactory = await ethers.getContractFactory(
            'RedeemableERC20'
        )

        const reserveInit = ethers.BigNumber.from('50000' + Util.eighteenZeros)
        const redeemInit = ethers.BigNumber.from('50000' + Util.eighteenZeros)
        const totalTokenSupply = ethers.BigNumber.from('200000' + Util.eighteenZeros)
        const minRaise = ethers.BigNumber.from('50000' + Util.eighteenZeros)

        const initialValuation = ethers.BigNumber.from('1000000' + Util.eighteenZeros)
        // Same logic used by trust.
        const finalValuation = minRaise.add(redeemInit)

        const tokenName = 'RedeemableERC20'
        const tokenSymbol = 'RDX'

        const now = await ethers.provider.getBlockNumber()
        const unblockBlock = now + 50

        const redeemable = await redeemableFactory.deploy(
            {
                name: tokenName,
                symbol: tokenSymbol,
                reserve: reserve.address,
                prestige: prestige.address,
                minimumStatus: minimumStatus,
                totalSupply: totalTokenSupply,
            }
        )

        await redeemable.deployed()
        await redeemable.ownerSetUnblockBlock(unblockBlock)

        const poolFactory = await ethers.getContractFactory(
            'RedeemableERC20Pool',
            {
                libraries: {
                    'RightsManager': rightsManager.address
                }
            }
        )

        const pool = await poolFactory.deploy(
            redeemable.address,
            {
                crpFactory: crpFactory.address,
                balancerFactory: bFactory.address,
                reserve: reserve.address,
                reserveInit: reserveInit,
                initialValuation: initialValuation,
                finalValuation: finalValuation,
            },
        ) as RedeemableERC20Pool

        await pool.deployed()

        // Trust normally does this internally.
        await redeemable.transfer(pool.address, await redeemable.totalSupply())

        await reserve.transfer(
            pool.address,
            reserveInit
        )
        await redeemable.approve(
            pool.address,
            totalTokenSupply
        )

        await pool.init(unblockBlock, {
            gasLimit: 10000000
        })

        // // The trust would do this internally but we need to do it here to test.
        let [crp, bPool] = await Util.poolContracts(signers, pool)

        await redeemable.ownerAddReceiver(crp.address)
        await redeemable.ownerAddSender(crp.address)
        await redeemable.ownerAddReceiver(bFactory.address)
        await redeemable.ownerAddReceiver(pool.address)

        // raise some funds
        const swapReserveForTokens = async (hodler, spend) => {
            // give hodler some reserve
            await reserve.transfer(hodler.address, spend)

            const reserveHodler = reserve.connect(hodler)
            const crpHodler = crp.connect(hodler)
            const bPoolHodler = bPool.connect(hodler)

            await crpHodler.pokeWeights()
            await reserveHodler.approve(bPool.address, spend)
            await bPoolHodler.swapExactAmountIn(
                reserve.address,
                spend,
                redeemable.address,
                ethers.BigNumber.from('1'),
                ethers.BigNumber.from('1000000' + Util.eighteenZeros)
            )
        }

        const reserveSpend = finalValuation.div(10) // 10% of target raise amount
        await swapReserveForTokens(signers[3], reserveSpend)

        // create a few blocks by sending some tokens around
        while ((await ethers.provider.getBlockNumber()) < (unblockBlock - 1)) {
            await reserve.transfer(signers[1].address, 1)
        }

        const bPoolReserveBeforeExit = await reserve.balanceOf(bPool.address)
        const ownerReserveBeforeExit = await reserve.balanceOf(signers[0].address)

        await pool.exit()

        const bPoolReserveAfterExit = await reserve.balanceOf(bPool.address)
        const ownerReserveAfterExit = await reserve.balanceOf(signers[0].address)

        const reserveDust = bPoolReserveBeforeExit
            .mul(Util.ONE).div(1e7).div(Util.ONE)
            .add(1) // rounding error

        assert(bPoolReserveAfterExit.eq(reserveDust),
            `wrong reserve left in balancer pool
            actual      ${bPoolReserveAfterExit}
            expected    ${reserveDust}
        `)

        assert(ownerReserveAfterExit.eq(ownerReserveBeforeExit.add(bPoolReserveBeforeExit.sub(reserveDust))),
            `wrong owner reserve balance
            actual      ${ownerReserveAfterExit}
            expected    ${ownerReserveBeforeExit.add(bPoolReserveBeforeExit.sub(reserveDust))}
        `)
    })

    it('should only allow owner to set pool unblock block and initialize pool', async function () {
        this.timeout(0)

        const signers = await ethers.getSigners()

        const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy()

        const reserve = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

        const prestigeFactory = await ethers.getContractFactory(
            'Prestige'
        )
        const prestige = await prestigeFactory.deploy() as Prestige
        const minimumStatus = 0

        const redeemableFactory = await ethers.getContractFactory(
            'RedeemableERC20'
        )

        const reserveInit = ethers.BigNumber.from('50000' + Util.eighteenZeros)
        const redeemInit = ethers.BigNumber.from('50000' + Util.eighteenZeros)
        const totalTokenSupply = ethers.BigNumber.from('200000' + Util.eighteenZeros)
        const minRaise = ethers.BigNumber.from('50000' + Util.eighteenZeros)

        const initialValuation = ethers.BigNumber.from('1000000' + Util.eighteenZeros)
        // Same logic used by trust.
        const finalValuation = minRaise.add(redeemInit)

        const tokenName = 'RedeemableERC20'
        const tokenSymbol = 'RDX'

        const now = await ethers.provider.getBlockNumber()
        const unblockBlock = now + 50

        const redeemable = await redeemableFactory.deploy(
            {
                name: tokenName,
                symbol: tokenSymbol,
                reserve: reserve.address,
                prestige: prestige.address,
                minimumStatus: minimumStatus,
                totalSupply: totalTokenSupply,
            }
        )

        await redeemable.deployed()
        await redeemable.ownerSetUnblockBlock(unblockBlock)

        const poolFactory = await ethers.getContractFactory(
            'RedeemableERC20Pool',
            {
                libraries: {
                    'RightsManager': rightsManager.address
                }
            }
        )

        const pool = await poolFactory.deploy(
            redeemable.address,
            {
                crpFactory: crpFactory.address,
                balancerFactory: bFactory.address,
                reserve: reserve.address,
                reserveInit: reserveInit,
                initialValuation: initialValuation,
                finalValuation: finalValuation,
            },
        ) as RedeemableERC20Pool

        await pool.deployed()

        const pool1 = pool.connect(signers[1])

        // Before init

        await Util.assertError(
            async () => await pool.exit(),
            "revert ONLY_INIT",
            "owner was wrongly able to exit pool before initialized"
        )

        // Init pool

        // Send all tokens to the pool immediately.
        // When the seed funds are raised, will build a pool from these.
        // Trust normally does this internally.
        await redeemable.transfer(pool.address, await redeemable.totalSupply())

        const reserve1 = new ethers.Contract(reserve.address, reserve.interface, signers[1])

        await reserve.transfer(signers[1].address, reserveInit)

        await reserve1.transfer(
            pool.address,
            reserveInit
        )

        await Util.assertError(
            async () => await pool1.init(unblockBlock, { gasLimit: 10000000 }),
            "revert Ownable: caller is not the owner",
            "non-owner was wrongly able to init pool"
        )

        await reserve.approve(
            pool.address,
            reserveInit
        )

        await pool.init(unblockBlock, { gasLimit: 10000000 })

        await reserve.approve(
            pool.address,
            reserveInit
        )

        await Util.assertError(async () =>
            await pool.init(unblockBlock, { gasLimit: 10000000 }),
            "revert ONLY_NOT_INIT",
            "pool wrongly initialized twice by owner"
        )

        // Exit pool

        // The trust would do this internally but we need to do it here to test.
        const crp = await pool.crp()
        await redeemable.ownerAddSender(crp)
        await redeemable.ownerAddReceiver(crp)
        await redeemable.ownerAddReceiver(bFactory.address)
        await redeemable.ownerAddReceiver(pool.address)


        // Before unblock block
        await Util.assertError(
            async () => await pool.exit(),
            "revert ONLY_UNBLOCKED",
            "owner was wrongly able to exit pool before unblock block"
        )

        // create a few blocks by sending some tokens around
        while ((await ethers.provider.getBlockNumber()) < (unblockBlock - 1)) {
            await reserve.transfer(signers[2].address, 1)
        }

        await Util.assertError(
            async () => await pool1.exit(),
            "revert Ownable: caller is not the owner",
            "non-owner was wrongly able to exit pool"
        )

        await pool.exit()
    })

    it("should construct a pool with whitelisting", async function () {
        this.timeout(0)

        const signers = await ethers.getSigners()

        const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy()

        const reserve = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

        const prestigeFactory = await ethers.getContractFactory(
            'Prestige'
        )
        const prestige = await prestigeFactory.deploy() as Prestige
        const minimumStatus = 0

        const redeemableFactory = await ethers.getContractFactory(
            'RedeemableERC20'
        )

        const reserveInit = ethers.BigNumber.from('50000' + Util.eighteenZeros)
        const redeemInit = ethers.BigNumber.from('50000' + Util.eighteenZeros)
        const totalTokenSupply = ethers.BigNumber.from('200000' + Util.eighteenZeros)
        const minRaise = ethers.BigNumber.from('50000' + Util.eighteenZeros)

        const initialValuation = ethers.BigNumber.from('1000000' + Util.eighteenZeros)
        // Same logic used by trust.
        const finalValuation = minRaise.add(redeemInit)

        const expectedRights = [false, false, true, false, true, false]

        // The final valuation of redeemable should be 100 000 as this is the redemption value.
        // Reserve init has value of 50 000 so ratio is 2:1.
        const expectedFinalWeight = ethers.BigNumber.from('2' + Util.eighteenZeros)

        const tokenName = 'RedeemableERC20'
        const tokenSymbol = 'RDX'

        const now = await ethers.provider.getBlockNumber()
        const unblockBlock = now + 15

        const redeemable = await redeemableFactory.deploy(
            {
                name: tokenName,
                symbol: tokenSymbol,
                reserve: reserve.address,
                prestige: prestige.address,
                minimumStatus: minimumStatus,
                totalSupply: totalTokenSupply,
            }
        )

        await redeemable.deployed()
        await redeemable.ownerSetUnblockBlock(unblockBlock)

        assert(
            (await reserve.balanceOf(redeemable.address)).eq(0),
            'reserve was not 0 on redeemable construction'
        )
        assert(
            (await redeemable.totalSupply()).eq(totalTokenSupply),
            `total supply was not ${totalTokenSupply} on redeemable construction`
        )
        assert(
            (await redeemable.unblockBlock()).eq(unblockBlock),
            `unblock block was not ${unblockBlock} in construction`
        )

        const poolFactory = await ethers.getContractFactory(
            'RedeemableERC20Pool',
            {
                libraries: {
                    'RightsManager': rightsManager.address
                }
            }
        )

        const pool = await poolFactory.deploy(
            redeemable.address,
            {
                crpFactory: crpFactory.address,
                balancerFactory: bFactory.address,
                reserve: reserve.address,
                reserveInit: reserveInit,
                initialValuation: initialValuation,
                finalValuation: finalValuation,
            },
        ) as RedeemableERC20Pool

        await pool.deployed()

        // Trust normally does this internally.
        await redeemable.transfer(pool.address, await redeemable.totalSupply())

        assert((await pool.token()) === redeemable.address, 'wrong token address')
        assert(await pool.owner() === signers[0].address, 'wrong owner')
        assert(await pool.owner() === await redeemable.owner(), 'mismatch owner')

        await reserve.transfer(
            pool.address,
            reserveInit
        )
        await redeemable.approve(
            pool.address,
            totalTokenSupply
        )

        await pool.init(unblockBlock, {
            gasLimit: 10000000
        })

        let [crp, bPool] = await Util.poolContracts(signers, pool)

        const actualRights = await crp.rights()

        expectedRights.forEach((expectedRight, i) => {
            assert(actualRights[i] === expectedRight, `wrong right ${i} ${expectedRight} ${actualRights[i]}`)
        });

        // whitelisted LPs
        await Util.assertError(
            async () => await crp.joinPool(1, []),
            "revert ERR_NOT_ON_WHITELIST",
            "non-whitelisted signer wrongly joined pool"
        )

        // The trust would do this internally but we need to do it here to test.
        await redeemable.ownerAddSender(crp.address)
        await redeemable.ownerAddReceiver(crp.address)
        await redeemable.ownerAddReceiver(bFactory.address)
        await redeemable.ownerAddReceiver(pool.address)

        await Util.assertError(
            async () => await pool.exit(),
            'revert ONLY_UNBLOCKED',
            'failed to error on early exit'
        )

        // create a few blocks by sending some tokens around
        while ((await ethers.provider.getBlockNumber()) < (unblockBlock - 1)) {
            await reserve.transfer(signers[1].address, 1)
        }

        await pool.exit()
    })

    // it('should be able to exit Trust if creator fails to exit', async function() {
    //     this.timeout(0)

    //     const signers = await ethers.getSigners()

    //     const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy()

    //     const reserve = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

    //     const prestigeFactory = await ethers.getContractFactory(
    //         'Prestige'
    //     )
    //     const prestige = await prestigeFactory.deploy() as Prestige
    //     const minimumStatus = 0

    //     const redeemableFactory = await ethers.getContractFactory(
    //         'RedeemableERC20'
    //     )

    //     const reserveInit = ethers.BigNumber.from('50000' + Util.eighteenZeros)
    //     const redeemInit = ethers.BigNumber.from('50000' + Util.eighteenZeros)
    //     const totalTokenSupply = ethers.BigNumber.from('200000' + Util.eighteenZeros)
    //     const minRaise = ethers.BigNumber.from('50000' + Util.eighteenZeros)

    //     const initialValuation = ethers.BigNumber.from('1000000' + Util.eighteenZeros)
    //     // Same logic used by trust.
    //     const finalValuation = minRaise.add(redeemInit)

    //     const tokenName = 'RedeemableERC20'
    //     const tokenSymbol = 'RDX'

    //     const now = await ethers.provider.getBlockNumber()
    //     const unblockBlock = now + 15

    //     const redeemable = await redeemableFactory.deploy(
    //         {
    //             name: tokenName,
    //             symbol: tokenSymbol,
    //             reserve: reserve.address,
    //             prestige: prestige.address,
    //             minimumStatus: minimumStatus,
    //             totalSupply: totalTokenSupply,
    //             unblockBlock: unblockBlock,
    //         }
    //     )

    //     await redeemable.deployed()

    //     assert(
    //         (await reserve.balanceOf(redeemable.address)).eq(0),
    //         'reserve was not 0 on redeemable construction'
    //     )
    //     assert(
    //         (await redeemable.totalSupply()).eq(totalTokenSupply),
    //         `total supply was not ${totalTokenSupply} on redeemable construction`
    //     )
    //     assert(
    //         (await redeemable.unblockBlock()).eq(unblockBlock),
    //         `unblock block was not ${unblockBlock} in construction`
    //     )

    //     const poolFactory = await ethers.getContractFactory(
    //         'RedeemableERC20Pool',
    //         {
    //             libraries: {
    //                 'RightsManager': rightsManager.address
    //             }
    //         }
    //     )

    //     const pool = await poolFactory.deploy(
    //         {
    //             crpFactory: crpFactory.address,
    //             balancerFactory: bFactory.address,
    //             reserveInit: reserveInit,
    //         },
    //         redeemable.address,
    //         redeemInit,
    //         initialValuation,
    //         finalValuation,
    //     )

    //     await pool.deployed()

    //     assert((await pool.token()) === redeemable.address, 'wrong token address')
    //     assert(await pool.owner() === signers[0].address, 'wrong owner')
    //     assert(await pool.owner() === await redeemable.owner(), 'mismatch owner')

    //     await reserve.approve(
    //         pool.address,
    //         await pool.poolAmounts(0)
    //     )
    //     await redeemable.approve(
    //         pool.address,
    //         await pool.poolAmounts(1)
    //     )

    //     await pool.init({
    //         gasLimit: 10000000
    //     })

    //     // The trust would do this internally but we need to do it here to test.
    //     const crp = await pool.crp()
    //     const bPool = await pool.pool()
    //     await redeemable.addUnfreezable(crp)
    //     await redeemable.addUnfreezable(bFactory.address)
    //     await redeemable.addUnfreezable(pool.address)

    //     await Util.assertError(
    //         async () => await pool.exit(),
    //         'revert ONLY_UNBLOCKED',
    //         'failed to error on early exit'
    //     )

    //     // create a few blocks by sending some tokens around
    //     while ((await ethers.provider.getBlockNumber()) < (unblockBlock - 1)) {
    //         await reserve.transfer(signers[1].address, 1)
    //     }

    //     // owner 'rage quits' and fails to exit pool, locking everyone's tokens in limbo
    //     // someone else can exit pool
    //     const pool2 = new ethers.Contract(pool.address, pool.interface, signers[1]);
    //     await pool2.exit();

    //     assert((await redeemable.balanceOf(pool.address)).eq(0), 'non-owner failed to close pool')
    // })

    it('should construct pool and exit with 0 minimum raise', async function () {
        this.timeout(0)

        const signers = await ethers.getSigners()

        const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy()

        const reserve = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

        const prestigeFactory = await ethers.getContractFactory(
            'Prestige'
        )
        const prestige = await prestigeFactory.deploy() as Prestige
        const minimumStatus = 0

        const redeemableFactory = await ethers.getContractFactory(
            'RedeemableERC20'
        )

        const reserveInit = ethers.BigNumber.from('50000' + Util.eighteenZeros)
        const redeemInit = ethers.BigNumber.from('50000' + Util.eighteenZeros)
        const totalTokenSupply = ethers.BigNumber.from('200000' + Util.eighteenZeros)
        const minRaise = ethers.BigNumber.from('0' + Util.eighteenZeros)

        const initialValuation = ethers.BigNumber.from('1000000' + Util.eighteenZeros)
        // Same logic used by trust.
        const finalValuation = minRaise.add(redeemInit)

        const tokenName = 'RedeemableERC20'
        const tokenSymbol = 'RDX'

        const now = await ethers.provider.getBlockNumber()
        const unblockBlock = now + 15

        const redeemable = await redeemableFactory.deploy(
            {
                name: tokenName,
                symbol: tokenSymbol,
                prestige: prestige.address,
                minimumStatus: minimumStatus,
                totalSupply: totalTokenSupply,
            }
        )

        await redeemable.deployed()
        await redeemable.ownerSetUnblockBlock(unblockBlock)

        assert(
            (await reserve.balanceOf(redeemable.address)).eq(0),
            'reserve was not 0 on redeemable construction'
        )
        assert(
            (await redeemable.totalSupply()).eq(totalTokenSupply),
            `total supply was not ${totalTokenSupply} on redeemable construction`
        )
        assert(
            (await redeemable.unblockBlock()).eq(unblockBlock),
            `unblock block was not ${unblockBlock} in construction`
        )

        const poolFactory = await ethers.getContractFactory(
            'RedeemableERC20Pool',
            {
                libraries: {
                    'RightsManager': rightsManager.address
                }
            }
        )

        const pool = await poolFactory.deploy(
            redeemable.address,
            {
                crpFactory: crpFactory.address,
                balancerFactory: bFactory.address,
                reserve: reserve.address,
                reserveInit: reserveInit,
                initialValuation: initialValuation,
                finalValuation: finalValuation,
            },
        ) as RedeemableERC20Pool

        await pool.deployed()

        // Trust normally does this internally.
        await redeemable.transfer(pool.address, await redeemable.totalSupply())

        assert((await pool.token()) === redeemable.address, 'wrong token address')
        assert(await pool.owner() === signers[0].address, 'wrong owner')
        assert(await pool.owner() === await redeemable.owner(), 'mismatch owner')

        await reserve.transfer(
            pool.address,
            reserveInit
        )
        await redeemable.approve(
            pool.address,
            totalTokenSupply
        )

        await pool.init(unblockBlock, {
            gasLimit: 10000000
        })

        // The trust would do this internally but we need to do it here to test.
        let [crp, bPool] = await Util.poolContracts(signers, pool)
        await redeemable.ownerAddSender(crp.address)
        await redeemable.ownerAddReceiver(crp.address)
        await redeemable.ownerAddReceiver(bFactory.address)
        await redeemable.ownerAddReceiver(pool.address)

        await Util.assertError(
            async () => await pool.exit(),
            'revert ONLY_UNBLOCKED',
            'failed to error on early exit'
        )

        // create a few blocks by sending some tokens around
        while ((await ethers.provider.getBlockNumber()) < (unblockBlock - 1)) {
            await reserve.transfer(signers[1].address, 1)
        }

        await pool.exit()
    })

    it('should fail to construct pool if initial reserve amount is zero', async function () {
        this.timeout(0)

        const signers = await ethers.getSigners()

        const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy()

        const reserve = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

        const prestigeFactory = await ethers.getContractFactory(
            'Prestige'
        )
        const prestige = await prestigeFactory.deploy() as Prestige
        const minimumStatus = 0

        const redeemableFactory = await ethers.getContractFactory(
            'RedeemableERC20'
        )

        const reserveInit = ethers.BigNumber.from('0' + Util.eighteenZeros)
        const redeemInit = ethers.BigNumber.from('50000' + Util.eighteenZeros)
        const totalTokenSupply = ethers.BigNumber.from('200000' + Util.eighteenZeros)
        const minRaise = ethers.BigNumber.from('50000' + Util.eighteenZeros)

        const initialValuation = ethers.BigNumber.from('1000000' + Util.eighteenZeros)
        // Same logic used by trust.
        const finalValuation = minRaise.add(redeemInit)

        const tokenName = 'RedeemableERC20'
        const tokenSymbol = 'RDX'

        const now = await ethers.provider.getBlockNumber()
        const unblockBlock = now + 15

        const redeemable = await redeemableFactory.deploy(
            {
                name: tokenName,
                symbol: tokenSymbol,
                prestige: prestige.address,
                minimumStatus: minimumStatus,
                totalSupply: totalTokenSupply,
            }
        )

        await redeemable.deployed()
        await redeemable.ownerSetUnblockBlock(unblockBlock)

        assert(
            (await reserve.balanceOf(redeemable.address)).eq(0),
            'reserve was not 0 on redeemable construction'
        )
        assert(
            (await redeemable.totalSupply()).eq(totalTokenSupply),
            `total supply was not ${totalTokenSupply} on redeemable construction`
        )
        assert(
            (await redeemable.unblockBlock()).eq(unblockBlock),
            `unblock block was not ${unblockBlock} in construction`
        )

        const poolFactory = await ethers.getContractFactory(
            'RedeemableERC20Pool',
            {
                libraries: {
                    'RightsManager': rightsManager.address
                }
            }
        )

        await Util.assertError(
            async () => {
                const pool = await poolFactory.deploy(
                    redeemable.address,
                    {
                        crpFactory: crpFactory.address,
                        balancerFactory: bFactory.address,
                        reserve: reserve.address,
                        reserveInit: reserveInit,
                        initialValuation: initialValuation,
                        finalValuation: finalValuation,
                    },
                )
                await pool.deployed()
            },
            'revert RESERVE_INIT_0',
            'failed to error when reserve is 0 at construction',
        )
    })

    it('should fail to construct pool if zero minted tokens', async function () {
        this.timeout(0)

        const signers = await ethers.getSigners()

        const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy()

        const reserve = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

        const prestigeFactory = await ethers.getContractFactory(
            'Prestige'
        )
        const prestige = await prestigeFactory.deploy() as Prestige
        const minimumStatus = 0

        const redeemableFactory = await ethers.getContractFactory(
            'RedeemableERC20'
        )

        const reserveInit = ethers.BigNumber.from('50000' + Util.eighteenZeros)
        const redeemInit = ethers.BigNumber.from('50000' + Util.eighteenZeros)
        const totalTokenSupply = ethers.BigNumber.from('0' + Util.eighteenZeros)
        const minRaise = ethers.BigNumber.from('50000' + Util.eighteenZeros)

        const initialValuation = ethers.BigNumber.from('1000000' + Util.eighteenZeros)
        // Same logic used by trust.
        const finalValuation = minRaise.add(redeemInit)

        const tokenName = 'RedeemableERC20'
        const tokenSymbol = 'RDX'

        const now = await ethers.provider.getBlockNumber()
        const unblockBlock = now + 15

        const redeemable = await redeemableFactory.deploy(
            {
                name: tokenName,
                symbol: tokenSymbol,
                prestige: prestige.address,
                minimumStatus: minimumStatus,
                totalSupply: totalTokenSupply,
            }
        )

        await redeemable.deployed()
        await redeemable.ownerSetUnblockBlock(unblockBlock)

        assert(
            (await reserve.balanceOf(redeemable.address)).eq(0),
            'reserve was not 0 on redeemable construction'
        )
        assert(
            (await redeemable.totalSupply()).eq(totalTokenSupply),
            `total supply was not ${totalTokenSupply} on redeemable construction`
        )
        assert(
            (await redeemable.unblockBlock()).eq(unblockBlock),
            `unblock block was not ${unblockBlock} in construction`
        )

        const poolFactory = await ethers.getContractFactory(
            'RedeemableERC20Pool',
            {
                libraries: {
                    'RightsManager': rightsManager.address
                }
            }
        )

        await Util.assertError(
            async () => {
                const pool = await poolFactory.deploy(
                    redeemable.address,
                    {
                        crpFactory: crpFactory.address,
                        balancerFactory: bFactory.address,
                        reserve: reserve.address,
                        reserveInit: reserveInit,
                        initialValuation: initialValuation,
                        finalValuation: finalValuation,
                    },
                )
                await pool.deployed()
            },
            'revert TOKEN_INIT_0',
            'failed to error when constructed with 0 total supply'
        )
    })

    it("should fail to construct pool if initial redeemable amount is zero", async function () {
        this.timeout(0)

        const signers = await ethers.getSigners()

        const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy()

        const reserve = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

        const prestigeFactory = await ethers.getContractFactory(
            'Prestige'
        )
        const prestige = await prestigeFactory.deploy() as Prestige
        const minimumStatus = 0

        const redeemableFactory = await ethers.getContractFactory(
            'RedeemableERC20'
        )

        const reserveInit = ethers.BigNumber.from('50000' + Util.eighteenZeros)
        const redeemInit = ethers.BigNumber.from('0' + Util.eighteenZeros)
        const totalTokenSupply = ethers.BigNumber.from('200000' + Util.eighteenZeros)
        const minRaise = ethers.BigNumber.from('50000' + Util.eighteenZeros)

        const initialValuation = ethers.BigNumber.from('1000000' + Util.eighteenZeros)
        // Same logic used by trust.
        const finalValuation = minRaise.add(redeemInit)

        const tokenName = 'RedeemableERC20'
        const tokenSymbol = 'RDX'

        const now = await ethers.provider.getBlockNumber()
        const unblockBlock = now + 15

        const redeemable = await redeemableFactory.deploy(
            {
                name: tokenName,
                symbol: tokenSymbol,
                prestige: prestige.address,
                minimumStatus: minimumStatus,
                totalSupply: totalTokenSupply,
            }
        )

        await redeemable.deployed()
        await redeemable.ownerSetUnblockBlock(unblockBlock)

        assert(
            (await reserve.balanceOf(redeemable.address)).eq(0),
            'reserve was not 0 on redeemable construction'
        )
        assert(
            (await redeemable.totalSupply()).eq(totalTokenSupply),
            `total supply was not ${totalTokenSupply} on redeemable construction`
        )
        assert(
            (await redeemable.unblockBlock()).eq(unblockBlock),
            `unblock block was not ${unblockBlock} in construction`
        )

        const poolFactory = await ethers.getContractFactory(
            'RedeemableERC20Pool',
            {
                libraries: {
                    'RightsManager': rightsManager.address
                }
            }
        )

        await poolFactory.deploy(
            redeemable.address,
            {
                crpFactory: crpFactory.address,
                balancerFactory: bFactory.address,
                reserve: reserve.address,
                reserveInit: reserveInit,
                initialValuation: initialValuation,
                finalValuation: finalValuation,
            },
        )
    })
})