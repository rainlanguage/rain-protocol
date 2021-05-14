import * as Util from './Util'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { ReserveToken } from '../typechain/ReserveToken'
import type { RightsManager } from '../typechain/RightsManager'
import type { CRPFactory } from '../typechain/CRPFactory'
import type { BFactory } from '../typechain/BFactory'
import { utils } from 'ethers'
import { Utils } from '@maticnetwork/maticjs/lib/common/Utils'

chai.use(solidity)
const { expect, assert } = chai

describe("RedeemableERC20Pool", async function() {
    let owner: any;
    let bob: any;
    let reserve: any;
    let pool: any;
    let redeemable: any;
    let reserveTotal: any;
    let mintRatio: any;
    let mint_init: any;
    let reserveRedeemable: any;
    let unblockBlock: any;
    let expectedRedeemableTotal: any;
    let expectedRedeemableReserveInit: any;
    let expectedPoolReserveInit: any;
    let expectedRights: any;
    let expectedPoolAmounts: any;
    let poolInitialValuation: any;
    let poolFinalValuation: any;
    let tokenWeight: any;
    let expectedStartWeights: any;
    let expectedTargetWeights: any;
    let expectedPoolAddresses: any;



    before(async () => {
        [owner, bob] = await ethers.getSigners()

        const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy()

        reserve = (await Util.basicDeploy('ReserveToken', {})) as ReserveToken

        const redeemableFactory = await ethers.getContractFactory(
            'RedeemableERC20'
        )

        reserveTotal = ethers.BigNumber.from('150000' + Util.eighteenZeros)
         mintRatio = ethers.BigNumber.from('2' + Util.eighteenZeros)
        const bookRatio = ethers.BigNumber.from('2' + Util.eighteenZeros)
         mint_init = ethers.BigNumber.from((150000 * 2) + Util.eighteenZeros);
        // Normally the Trust would do this calculation internally but to test the Pool we need to do this manually here.
        reserveRedeemable = reserveTotal.mul(bookRatio).div(bookRatio.add(ethers.BigNumber.from('1' + Util.eighteenZeros)))

        // The redeemable token should be backed by the ( book ratio of reserve ) x mint ratio.
        // e.g. If
        // - reserve is 150 000
        // - book ratio is 2
        // - reserve in token = ( book / ( book + 1)) * reserve
        // - reserve in token = ( 2 / 3 ) * reserve = 100 000
        // - mint ratio is 2
        // - token total = 2 x 100 000 = 200 000
        expectedRedeemableTotal = ethers.BigNumber.from('200000' + Util.eighteenZeros)
        expectedRedeemableReserveInit = ethers.BigNumber.from('100000' + Util.eighteenZeros)
        expectedPoolReserveInit = ethers.BigNumber.from('50000' + Util.eighteenZeros)
        expectedRights = [false, false, true, true, false, false]

        expectedPoolAmounts = [expectedPoolReserveInit, mint_init]

        // Let's say we want to value the redeemable at 1 000 000 reserve
        // The pool has 50 000 reserve
        // So the weight needs to be 20:1
        // The mint ratio doesn't matter.
        // Whatever the total tokens on the other side of the reserve is, that will be valued at
        // 20x the reserve value, measured in terms of the reserve value.
        poolInitialValuation = ethers.BigNumber.from('1000000' + Util.eighteenZeros)
        poolFinalValuation = ethers.BigNumber.from('1500000' + Util.eighteenZeros)
        tokenWeight = ethers.BigNumber.from(((1000000 / 30000) * (30000 / 50000)) + Util.eighteenZeros)
        expectedStartWeights = [
            ethers.BigNumber.from('1' + Util.eighteenZeros),
            tokenWeight
            //ethers.BigNumber.from('20' + Util.eighteenZeros),
        ]

        // The final valuation of redeemable should be 100 000 as this is the redemption value
        // Tokens are 2:1 mint ratio and the book ratio is 2:1 so the weight should be 1:1
        expectedTargetWeights = [
            ethers.BigNumber.from('1' + Util.eighteenZeros),
            ethers.BigNumber.from('1' + Util.eighteenZeros),
        ]

        unblockBlock = await ethers.provider.getBlockNumber() + 20;
        redeemable = await redeemableFactory.deploy(
            'RedeemableERC20',
            'RDX',
            reserve.address,
            mint_init,
            unblockBlock,
        )

        await redeemable.deployed()


        const poolFactory = await ethers.getContractFactory(
            'RedeemableERC20Pool',
            {
                libraries: {
                    'RightsManager': rightsManager.address
                }
            }
        )

        pool = await poolFactory.deploy(
            crpFactory.address,
            bFactory.address,
            redeemable.address,
            expectedPoolReserveInit,
            expectedRedeemableReserveInit,
            poolInitialValuation,
            poolFinalValuation
        )

        await pool.deployed()

        expectedPoolAddresses = [reserve.address, redeemable.address]
    });


    it("should correctly return the parameters of the redeemable constructor", async function () {
        assert(
            (await reserve.balanceOf(redeemable.address)).eq(0),
            'reserve was not 0 on redeemable construction'
        )
        assert(
            (await redeemable.totalSupply()).eq(mint_init),
            'total supply was not 0 on redeemable construction'
        )
        assert(
            (await redeemable.unblock_block()).eq(unblockBlock),
            'unblock block was set in construction'
        )
    });


    it("should correctly init the redeemable", async function (){
        await reserve.approve(redeemable.address, reserveRedeemable)
        await reserve.connect(owner).transfer(redeemable.address, expectedRedeemableReserveInit)
        const actualRedeemableReserveInit = await reserve.balanceOf(redeemable.address)
        assert(
            actualRedeemableReserveInit.eq(expectedRedeemableReserveInit),
            `redeemable did not init correctly ${expectedRedeemableReserveInit} ${actualRedeemableReserveInit}`
        )
    });


    it("should correctly return the parameters of the pool constructor", async function () {
        assert((await pool.token()) === redeemable.address, 'wrong token address')
        assert(await pool.owner() === owner.address, 'wrong owner')
        assert(await pool.owner() === await redeemable.owner(), 'mismatch owner')
    });


    it("should return the rights correctly", async function (){
        let expectedRight;
        for (let i = 0; expectedRight = expectedRights[i]; i++) {
            const actualRight = await pool.rights(i)
            assert(actualRight === expectedRight, `wrong right ${i} ${expectedRight} ${actualRight}`)
        }
    });


    it("should return the pool addresses correctly", async function (){
        let expectedPoolAddress;
        for (let i = 0; expectedPoolAddress = expectedPoolAddresses[i]; i++) {
            const actualPoolAddress = (await pool.pool_addresses())[i]
            assert(
                actualPoolAddress === expectedPoolAddress,
                `wrong pool address ${i} ${expectedPoolAddress} ${actualPoolAddress}`
            )
        }
    });


    it("should correctly return the pool amounts", async function (){
        let expectedPoolAmount;
        for (let i = 0; expectedPoolAmount = expectedPoolAmounts[i]; i++) {
            const actualPoolAmount = await pool.pool_amounts(i)
            assert(
                actualPoolAmount.eq(expectedPoolAmount),
                `wrong pool amount ${i} ${expectedPoolAmount} ${actualPoolAmount}`
            )
        }
    });


    it("should correctly return the initial weights", async function (){
        let expectedStartWeight;
        for (let i = 0; expectedStartWeight = expectedStartWeights[i]; i++) {
            const actualStartWeight = await pool.start_weights(i)
            assert(
                actualStartWeight.eq(expectedStartWeight),
                `wrong start weight ${i} ${expectedStartWeight} ${actualStartWeight}`,
            )
        }
    });


    it("should correctly return target weights", async function (){
        let expectedTargetWeight;
        for (let i = 0; expectedTargetWeight = expectedTargetWeights[i]; i++) {
            const actualTargetWeight = await pool.target_weights(i)
            assert(
                actualTargetWeight.eq(expectedTargetWeight),
                `wrong target weight ${i} ${expectedTargetWeight} ${actualTargetWeight}`
            )
        }
    });


    it("should fail the reserve approval", async function() {
        await reserve.approve(
            pool.address,
            ("5000"+ Util.eighteenZeros)
        )
        await redeemable.approve(
            pool.address,
            await pool.pool_amounts(1)
        )
        let err = false
        try {
            await pool.init();
        } catch (e) {
            assert(e.toString().includes('revert ERR_RESERVE_ALLOWANCE'))
            err = true;
        }

        assert(err, '')
    });


    it("should fail the token approval", async function() {
        await reserve.approve(
            pool.address,
            await pool.pool_amounts(0)
        )
        await redeemable.approve(
            pool.address,
            ("5000"+ Util.eighteenZeros)
        )

        let err = false;
        try {
            await pool.init();
        } catch (e) {
            assert(e.toString().includes('revert ERR_TOKEN_ALLOWANCE'))
            err = true;
        }

        assert(err, '')
    });


    it("should fail to exit due to blockage", async function (){
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

        // The trust would do this internally but we need to do it here to test.
        const crp = await pool.crp()
        //console.log('crp', crp)
        const balancer_factory = await pool.balancer_factory()
        //console.log('balancer_factory', balancer_factory)
        const bPool = await pool.pool()
        //console.log('bPool', bPool)
        await redeemable.addUnfreezable(crp)
        await redeemable.addUnfreezable(balancer_factory)
        await redeemable.addUnfreezable(pool.address)

        let exitErrored = false
        try {
            await pool.exit()
        } catch (e) {
            assert(e.toString().includes('revert ERR_ONLY_UNBLOCKED'), 'exit was allowed before unblock')
            exitErrored = true
        }
        assert(exitErrored, 'failed to error on early exit')
    });


    it("should correctly pass the exit", async function() {
        // create a few blocks by sending some tokens around
        while ((await ethers.provider.getBlockNumber()) < (unblockBlock - 1)) {
            await reserve.transfer(owner.address, 1)
        }

        // console.log('pool', pool.address)
        // console.log('redeemable', redeemable.address)
        // console.log('signer', signers[0].address)

        await pool.exit()

        // console.log('' + await reserve.balanceOf(signers[0].address))
        // console.log('' + await redeemable.totalSupply())
    });
})