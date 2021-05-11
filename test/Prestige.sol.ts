import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { Prestige } from '../typechain/Prestige'
import hre from 'hardhat'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { tvkStatusReport, blockNumbersToReport } from '../utils/status-report'

chai.use(solidity)
const { expect, assert } = chai

let uninitializedReport = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
let uninitializedStatus = '0xffffffff'
const nil = 0;
const copper = 1;
const bronze = 2;
const silver = 3;
const gold = 4;
const platinum = 5;
const diamond = 6;
const chad = 7;
const jawad = 8;
const statuses = [nil, copper, bronze, silver, gold, platinum, diamond, chad, jawad]

const setup = async ():Promise<[SignerWithAddress[], Prestige]> => {
    const signers = await ethers.getSigners();
    const prestigeFactory = await ethers.getContractFactory(
        'Prestige'
    );
    const prestige = await prestigeFactory.deploy() as Prestige
    await prestige.deployed()
    return [signers, prestige]
}

const assertError = async (f:Function, s:string, e:string) => {
    let didError = false
    try {
        await f()
    } catch (e) {
        assert(e.toString().includes(s))
        didError = true
    }
    assert(didError, e)
}


describe('Account status', async function() {

    it('will return uninitialized status report if nothing set', async function() {
        const [signers, prestige] = await setup()
        for (let signer of signers) {
            const status = await prestige.statusReport(signer.address)
            assert(ethers.BigNumber.from(uninitializedReport).eq(status))
        }
    })

    it('will error if attempting to set status to NIL', async function() {
        const [signers, prestige] = await setup()
        await assertError(
            async () => { await prestige.setStatus(signers[0].address, nil, []) },
            'revert ERR_NIL_STATUS',
            'failed to error due to setting NIL status'
        )
    })

    it('will return status if set', async function() {
        const [signers, prestige] = await setup()
        let expected = tvkStatusReport(uninitializedReport)
        let expectedReport = blockNumbersToReport(expected);
        let i = 0;
        for (let status of statuses) {
            if (status) {
                await prestige.setStatus(signers[0].address, status, [])
                expected[i] = await ethers.provider.getBlockNumber()
                expectedReport = blockNumbersToReport(expected)
                i++
            }
            let actualReport = (await prestige.statusReport(signers[0].address)).toHexString().substring(2).padStart(64, '0')
            assert(expectedReport === actualReport)
        }
    })

    it('will fill multiple statuses at a time', async function() {
        const [signers, prestige] = await setup()
        let expected = tvkStatusReport(uninitializedReport)
        let expectedReport = blockNumbersToReport(expected)
        let o = 0
        let n = 0
        while (o < statuses.length) {
            n = Math.min(o + Math.floor(Math.random() * statuses.length), statuses.length - 1)
            await prestige.setStatus(signers[0].address, n, [])
            let block = await ethers.provider.getBlockNumber()
            expected = expected.map((item:number, index:number) => n - 1 >= index && index > o - 1 && n != o ? block : item)
            expectedReport = blockNumbersToReport(expected)
            if (expectedReport == uninitializedReport) {
                expected[0] = block
                expectedReport = blockNumbersToReport(expected)
            }
            let actualReport = (await prestige.statusReport(signers[0].address)).toHexString().substring(2).padStart(64, '0')
            assert(expectedReport === actualReport)
            o = n

            if (o === statuses.length - 1) break
        }
    })

})