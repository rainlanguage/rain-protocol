import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { Prestige } from '../typechain/Prestige'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { tvkStatusReport, blockNumbersToReport, assertError } from '../utils/status-report'

chai.use(solidity)
const { expect, assert } = chai

let uninitializedReport = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
let uninitializedStatusAsNum = 4294967295
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

describe('Account status', async function() {

    it('has correct uninitalized value', async function() {
        const [_, prestige] = await setup()
        assert(uninitializedReport === await (await prestige.UNINITIALIZED()).toHexString())
    })

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
            n = Math.max(1, Math.min(o + Math.floor(Math.random() * statuses.length), statuses.length - 1))
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

    it("will emit the status to which it was upgraded if it is upgraded for the first time", async function(){
        const [signers, prestige] = await setup()
        // change the status to bronze and check if event emitted
        await expect(prestige.setStatus(signers[0].address, 2, []))
        .to.emit(prestige, 'StatusChange')
        .withArgs(signers[0].address, [0, 2])
      });

    it("will return the current block number from level 0 to the new account status if updated for the first time", async function(){
        const [signers, prestige] = await setup()
        // change the status to silver
        await prestige.setStatus(signers[0].address, 3, []);
        // check with the contract
        const status = await prestige.statusReport(signers[0].address)
        const report = tvkStatusReport(status.toString())
        const currentBlock = await prestige.provider.getBlockNumber()
        expect(report[0]).to.equal(currentBlock)
        expect(report[1]).to.equal(currentBlock)
        expect(report[2]).to.equal(currentBlock)
    });

    it("will output the previous status level and the new updated status level", async function(){
        const [signers, prestige] = await setup()
        // change the status to copper
        await prestige.setStatus(signers[0].address, 1, []);
        // change the status to silver
        await expect(prestige.setStatus(signers[0].address, 3, []))
        .to.emit(prestige, 'StatusChange')
        .withArgs(signers[0].address, [1, 3])
    });

    it("will return the previous block number at the lower state level if it is updated to a higher state", async function(){
        const [signers, prestige] = await setup()
        // change the status to copper
        const tx = await prestige.setStatus(signers[0].address, 1, []);
        const previousBlock = tx.blockNumber
        // change the status to silver
        await prestige.setStatus(signers[0].address, 3, []);
        // check with the contract
        const status = await prestige.statusReport(signers[0].address)
        const report = tvkStatusReport(status.toString())
        expect(report[0]).to.equal(previousBlock)
    });

    it("will change the status from higher to lower", async function(){
        const [signers, prestige] = await setup()
        // change the status to silver
        await prestige.setStatus(signers[0].address, 3, []);
        // change the status to bronze
        await expect(prestige.setStatus(signers[0].address, 1, []))
        .to.emit(prestige, 'StatusChange')
        .withArgs(signers[0].address, [3, 1])
    });

    it("will return the previous block number at the current level if updating from a higher to a lower state", async function(){
        const [signers, prestige] = await setup()
        // change the status to silver
        const tx = await prestige.setStatus(signers[0].address, 3, []);
        const previousBlock = tx.blockNumber
        // change the status to copper
        await prestige.setStatus(signers[0].address, 1, []);
        // check with the contract
        const status = await prestige.statusReport(signers[0].address)
        const report = tvkStatusReport(status.toString())
        expect(report[0]).to.equal(previousBlock)
    });

    it("will be possible to know the previous status from the current status", async function(){
        const [signers, prestige] = await setup()
        // change the status to copper
        await prestige.setStatus(signers[0].address,  1, []);
        const previousBlock = await prestige.provider.getBlockNumber();
        // change the status to silver
        await prestige.setStatus(signers[0].address, 3, []);
        // check with the contract
        const status = await prestige.statusReport(signers[0].address)
        const report = tvkStatusReport(status.toString())
        expect(report[0]).to.equal(previousBlock)
    });

    it("will return the original block number if status 1 is called again", async function(){
        const [signers, prestige] = await setup()
        // change the status to anything
        await prestige.setStatus(signers[0].address,  Math.max(1, Math.floor(Math.random() * statuses.length)), []);
        const originalBlock = await prestige.provider.getBlockNumber();
        // change the status to copper
        await prestige.setStatus(signers[0].address, 1, []);
        // check with the contract
        const status = await prestige.statusReport(signers[0].address)
        const report = tvkStatusReport(status.toString())
        expect(report[0]).to.equal(originalBlock)
    });

    it("will return original block number at current status and the rest at uninitializedStatusAsNum after two continuous decrements", async function(){
        const [signers, prestige] = await setup()
        // change the status to silver
        await prestige.setStatus(signers[0].address,  3, []);
        const originalBlock = await prestige.provider.getBlockNumber();

        // change the status to bronze
        await prestige.setStatus(signers[0].address, 2, []);
        // change the status to copper
        await prestige.setStatus(signers[0].address, 1, []);

        // check with the contract
        const status = await prestige.statusReport(signers[0].address)
        const report = tvkStatusReport(status.toString())
        expect(report[2]).to.equal(uninitializedStatusAsNum)
        expect(report[1]).to.equal(uninitializedStatusAsNum)
        expect(report[0]).to.equal(originalBlock)
    });

    it("will return two different block numbers if two consecutive increments occur, the high bits will be uninitializedStatusAsNum", async function(){
        const [signers, prestige] = await setup()
        // change the status to bronze
        await prestige.setStatus(signers[0].address,  2, []);

        // change the status to gold
        await prestige.setStatus(signers[0].address, 4, []);

        // check with the contract
        const status = await prestige.statusReport(signers[0].address);
        const report = tvkStatusReport(status.toString());
        assert(report[0] === report[1]);
        assert(report[1] < report[2]);
        assert(report[2] === report[3]);
        expect(report[4]).to.equal(uninitializedStatusAsNum);
        expect(report[5]).to.equal(uninitializedStatusAsNum);
        expect(report[6]).to.equal(uninitializedStatusAsNum);
        expect(report[7]).to.equal(uninitializedStatusAsNum);
    });

})