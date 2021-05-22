import * as Util from './Util'
import chai, { util } from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { ReserveToken } from '../typechain/ReserveToken'
import type { Prestige } from '../typechain/Prestige'

chai.use(solidity)
const { expect, assert } = chai

describe("RedeemableERC20Pool", async function() {
    it("should construct a pool", async function() {
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

        const expectedRights = [false, false, true, true, false, false]

        const expectedPoolAmounts = [reserveInit, totalTokenSupply]

        // Let's say we want to value the redeemable at 1 000 000 reserve
        // The pool has 50 000 reserve
        // So the weight needs to be 20:1
        // Whatever the total tokens on the other side of the reserve is, that will be valued at
        // 20x the reserve value, measured in terms of the reserve value.
        const expectedStartWeights = [
            ethers.BigNumber.from('1' + Util.eighteenZeros),
            ethers.BigNumber.from('20' + Util.eighteenZeros),
        ]

        // The final valuation of redeemable should be 100 000 as this is the redemption value.
        // Reserve init has value of 50 000 so ratio is 2:1.
        const expectedTargetWeights = [
            ethers.BigNumber.from('1' + Util.eighteenZeros),
            ethers.BigNumber.from('2' + Util.eighteenZeros),
        ]

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
                unblockBlock: unblockBlock,
            }
        )

        await redeemable.deployed()

        const expectedPoolAddresses = [reserve.address, redeemable.address]

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
                reserveInit: reserveInit,
                initialValuation: initialValuation,
                finalValuation: finalValuation,
            },
            redeemInit,
        )

        await pool.deployed()

        assert((await pool.token()) === redeemable.address, 'wrong token address')
        assert(await pool.owner() === signers[0].address, 'wrong owner')
        assert(await pool.owner() === await redeemable.owner(), 'mismatch owner')

        let expectedRight;
        for (let i = 0; expectedRight = expectedRights[i]; i++) {
            const actualRight = await pool.rights(i)
            assert(actualRight === expectedRight, `wrong right ${i} ${expectedRight} ${actualRight}`)
        }

        let expectedPoolAddress;
        for (let i = 0; expectedPoolAddress = expectedPoolAddresses[i]; i++) {
            const actualPoolAddress = (await pool.poolAddresses())[i]
            assert(
                actualPoolAddress === expectedPoolAddress,
                `wrong pool address ${i} ${expectedPoolAddress} ${actualPoolAddress}`
            )
        }

        let expectedPoolAmount;
        for (let i = 0; expectedPoolAmount = expectedPoolAmounts[i]; i++) {
            const actualPoolAmount = await pool.poolAmounts(i)
            assert(
                actualPoolAmount.eq(expectedPoolAmount),
                `wrong pool amount ${i} ${expectedPoolAmount} ${actualPoolAmount}`
            )
        }

        let expectedStartWeight;
        for (let i = 0; expectedStartWeight = expectedStartWeights[i]; i++) {
            const actualStartWeight = await pool.startWeights(i)
            assert(
                actualStartWeight.eq(expectedStartWeight),
                `wrong start weight ${i} ${expectedStartWeight} ${actualStartWeight}`,
            )
        }

        let expectedTargetWeight;
        for (let i = 0; expectedTargetWeight = expectedTargetWeights[i]; i++) {
            const actualTargetWeight = await pool.targetWeights(i)
            assert(
                actualTargetWeight.eq(expectedTargetWeight),
                `wrong target weight ${i} ${expectedTargetWeight} ${actualTargetWeight}`
            )
        }
        await reserve.approve(
            pool.address,
            await pool.poolAmounts(0)
        )
        await redeemable.approve(
            pool.address,
            await pool.poolAmounts(1)
        )

        await pool.init(signers[0].address, {
            gasLimit: 10000000
        })

        // The trust would do this internally but we need to do it here to test.
        const crp = await pool.crp()
        const bPool = await pool.pool()
        await redeemable.addUnfreezable(crp)
        await redeemable.addUnfreezable(bFactory.address)
        await redeemable.addUnfreezable(pool.address)

        Util.assertError(
            async () => await pool.exit(),
            'revert ERR_ONLY_UNBLOCKED',
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

    //     Util.assertError(
    //         async () => await pool.exit(),
    //         'revert ERR_ONLY_UNBLOCKED',
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

    it('should construct pool and exit with 0 minimum raise', async function() {
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
                reserve: reserve.address,
                prestige: prestige.address,
                minimumStatus: minimumStatus,
                totalSupply: totalTokenSupply,
                unblockBlock: unblockBlock,
            }
        )

        await redeemable.deployed()

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
                reserveInit: reserveInit,
                initialValuation: initialValuation,
                finalValuation: finalValuation,
            },
            redeemInit,
        )

        await pool.deployed()

        assert((await pool.token()) === redeemable.address, 'wrong token address')
        assert(await pool.owner() === signers[0].address, 'wrong owner')
        assert(await pool.owner() === await redeemable.owner(), 'mismatch owner')

        await reserve.approve(
            pool.address,
            await pool.poolAmounts(0)
        )
        await redeemable.approve(
            pool.address,
            await pool.poolAmounts(1)
        )

        await pool.init(signers[0].address, {
            gasLimit: 10000000
        })

        // The trust would do this internally but we need to do it here to test.
        const crp = await pool.crp()
        const bPool = await pool.pool()
        await redeemable.addUnfreezable(crp)
        await redeemable.addUnfreezable(bFactory.address)
        await redeemable.addUnfreezable(pool.address)

        Util.assertError(
            async () => await pool.exit(),
            'revert ERR_ONLY_UNBLOCKED',
            'failed to error on early exit'
        )

        // create a few blocks by sending some tokens around
        while ((await ethers.provider.getBlockNumber()) < (unblockBlock - 1)) {
            await reserve.transfer(signers[1].address, 1)
        }

        await pool.exit()
    })

    it('should fail to construct pool if initial reserve amount is zero', async function() {
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
                reserve: reserve.address,
                prestige: prestige.address,
                minimumStatus: minimumStatus,
                totalSupply: totalTokenSupply,
                unblockBlock: unblockBlock,
            }
        )

        await redeemable.deployed()

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

        const pool = poolFactory.deploy(
            redeemable.address,
            {
                crpFactory: crpFactory.address,
                balancerFactory: bFactory.address,
                reserveInit: reserveInit,
                initialValuation: initialValuation,
                finalValuation: finalValuation,
            },
            redeemInit,
        )

        Util.assertError(
            async () => await pool,
            'revert ERR_RESERVE_AMOUNT',
            'initial reserve amount of 0 was accepted at construction'
        )
    })

    it('should fail to construct pool if zero minted tokens', async function() {
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
                reserve: reserve.address,
                prestige: prestige.address,
                minimumStatus: minimumStatus,
                totalSupply: totalTokenSupply,
                unblockBlock: unblockBlock,
            }
        )

        await redeemable.deployed()

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

        const pool = poolFactory.deploy(
            redeemable.address,
            {
                crpFactory: crpFactory.address,
                balancerFactory: bFactory.address,
                reserveInit: reserveInit,
                initialValuation: initialValuation,
                finalValuation: finalValuation,
            },
            redeemInit,
        )

        Util.assertError(
            async () => await pool,
            'revert ERR_TOKEN_AMOUNT',
            'initial mint amount of 0 was accepted at construction'
        )
    })

    it("should fail to construct pool if initial redeemable amount is zero", async function() {
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
                reserve: reserve.address,
                prestige: prestige.address,
                minimumStatus: minimumStatus,
                totalSupply: totalTokenSupply,
                unblockBlock: unblockBlock,
            }
        )

        await redeemable.deployed()

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

        Util.assertError(
            async () => await poolFactory.deploy(
                redeemable.address,
                {
                    crpFactory: crpFactory.address,
                    balancerFactory: bFactory.address,
                    reserveInit: reserveInit,
                    initialValuation: initialValuation,
                    finalValuation: finalValuation,
                },
                redeemInit,
            ),
            'revert SafeMath: division by zero',
            'initial redeemable token amount of 0 was accepted at construction'
        )
    })
})