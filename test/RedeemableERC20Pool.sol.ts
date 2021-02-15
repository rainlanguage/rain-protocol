import * as Util from './Util'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { ReserveToken } from '../typechain/ReserveToken'
import type { RightsManager } from '../typechain/RightsManager'
import type { CRPFactory } from '../typechain/CRPFactory'
import type { BFactory } from '../typechain/BFactory'

chai.use(solidity)
const { expect, assert } = chai

describe("RedeemableERC20Pool", async function() {
    it("should construct a pool", async function() {
        this.timeout(0)

        const signers = await ethers.getSigners()

        const rightsManager = (await Util.basicDeploy('RightsManager', {})) as RightsManager
        const balancerSafeMath = (await Util.basicDeploy('BalancerSafeMath', {}))
        const smartPoolManager = (await Util.basicDeploy('SmartPoolManager', {}))
        const crpFactory = (await Util.basicDeploy('CRPFactory', {
            'RightsManager': rightsManager.address,
            'BalancerSafeMath': balancerSafeMath.address,
            'SmartPoolManager': smartPoolManager.address,
        })) as CRPFactory
        const bFactory = (await Util.basicDeploy('BFactory', {})) as BFactory

        const reserve = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

        const redeemableFactory = await ethers.getContractFactory(
            'RedeemableERC20'
        )

        const reserveTotal = ethers.BigNumber.from('100' + Util.eighteenZeros)
        const ratio = ethers.BigNumber.from('2' + Util.eighteenZeros)

        const redeemable = await redeemableFactory.deploy(
            'RedeemableERC20',
            'RDX',
            reserve.address,
            reserveTotal,
            ratio,
        )

        await redeemable.deployed()

        assert(
            (await reserve.balanceOf(redeemable.address)).eq(0),
            'reserve was not 0 on redeemable construction'
        )
        assert(
            (await redeemable.totalSupply()).eq(0),
            'total supply was not 0 on redeemable construction'
        )
        assert(
            (await redeemable.unblock_block()).eq(0),
            'unblock block was set in construction'
        )

        const now = await ethers.provider.getBlockNumber()

        const unblockBlock = now + 10

        await reserve.approve(redeemable.address, reserveTotal)
        await redeemable.init(unblockBlock)

        const poolFactory = await ethers.getContractFactory(
            'RedeemableERC20Pool',
            {
                libraries: {
                    'RightsManager': rightsManager.address
                }
            }
        )

        const bookRatio = ethers.BigNumber.from('3' + Util.eighteenZeros)

        const pool = await poolFactory.deploy(
            crpFactory.address,
            bFactory.address,
            redeemable.address,
            bookRatio
        )

        await pool.deployed()

        assert((await pool.token()) === redeemable.address, 'wrong token address')
        assert((await pool.book_ratio()).eq(bookRatio), 'wrong book ratio')
        assert(await pool.owner() === signers[0].address, 'wrong owner')
        assert(await pool.owner() === await redeemable.owner(), 'mismatch owner')

        const expectedRights = [false, false, true, true, false, false]
        expectedRights.forEach(async (v, i) => {
            const actual = await pool.rights(i)
            assert(actual === v, `wrong rights ${i} ${v} ${actual}`)
        })

        const expectedPoolAddresses = [reserve.address, redeemable.address]
        expectedPoolAddresses.forEach(async (v, i) => {
            const actual = await pool.pool_addresses(i)
            assert(actual === v, `wrong pool address ${i} ${v} ${actual}`)
        })

        const expectedPoolAmounts = [reserveTotal.mul(3), await redeemable.totalSupply()]
        expectedPoolAmounts.forEach(async (v, i) => {
            const actual = await pool.pool_amounts(i)
            assert(actual.eq(v), `wrong pool amount ${i} ${v} ${actual}`)
        })

        const expectedStartWeights = [
            ethers.BigNumber.from('1' + Util.eighteenZeros),
            ethers.BigNumber.from('6' + Util.eighteenZeros),
        ]
        expectedStartWeights.forEach(async (v, i) => {
            const actual = await pool.start_weights(i)
            assert(actual.eq(v), `wrong start weights ${i} ${v} ${actual}`)
        })

        const expectedTargetWeights = [expectedStartWeights[1], expectedStartWeights[0]]
        expectedTargetWeights.forEach(async (v, i) => {
            const actual = await pool.target_weights(i)
            assert(actual.eq(v), `wrong target weights ${i} ${v} ${actual}`)
        })

        {
            const expected = ethers.BigNumber.from('1' + '000000' + '000000')
            const actual = await pool.pool_fee()
            assert(actual.eq(expected), `wrong pool fee ${expected} ${actual}`)
        }

        await reserve.approve(
            pool.address,
            await pool.pool_amounts(0)
        )
        await redeemable.approve(
            pool.address,
            await pool.pool_amounts(1)
        )

        await pool.init({
            gasLimit: 10000000
        })

    })
})