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
                console.log(i, expected)
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
        let o = 1
        let n = 1
        while (o < statuses.length) {
            n = Math.min(o + Math.floor(Math.random() * statuses.length), statuses.length - 1)
            await prestige.setStatus(signers[0].address, n, [])
            let block = await ethers.provider.getBlockNumber()
            expected = expected.map((item:number, index:number) => --n >= index && index > --o ? block : item)
            expectedReport = blockNumbersToReport(expected)
            let actualReport = (await prestige.statusReport(signers[0].address)).toHexString().substring(2).padStart(64, '0')
            console.log(expectedReport)
            console.log(actualReport)
            o = n

            if (o === statuses.length - 1) break
        }
    })

    it("will emit the status to which it was upgraded if it is upgraded for the first time", async function(){
        const [signers, prestige] = await setup()
        // change the status to silver and check if event emitted
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
        console.log('current block', currentBlock)
        console.log('the report', report)
        expect(report[0]).to.equal(currentBlock)
        expect(report[1]).to.equal(currentBlock)
        expect(report[2]).to.equal(currentBlock)
    });
    
    it("will output the previous status level and the new updated status level", async function(){
        const [signers, prestige] = await setup()
        // change the status to bronce
        await prestige.setStatus(signers[0].address, 1, []);
        // change the status to gold
        await expect(prestige.setStatus(signers[0].address, 3, []))
        .to.emit(prestige, 'StatusChange')
        .withArgs(signers[0].address, [1, 3])
    });
    
    // it("will return the previous block number at the lower state level if it is updated to a higher state", async function(){
    // // reset the fork
    // await hre.network.provider.request({
    //     method: "hardhat_reset",
    //     params: [{
    //     forking: {
    //         jsonRpcUrl: "https://eth-mainnet.alchemyapi.io/v2/0T6PEQIu3w1qwoPoPG3XPJHvKAzXEjkv",
    //         blockNumber: 12206000
    //     }
    //     }]
    // })

    // // get first hardhat signer address
    // const signers = await ethers.getSigners()
    // const address = signers[0].address;

    // // deploy TVKPrestige
    // const tvkprestigeFactory = await ethers.getContractFactory(
    //     'TVKPrestige'
    // );
    // const tvkPrestige = await tvkprestigeFactory.deploy() as TVKPrestige;
    // let deployedTvkPrestige = await tvkPrestige.deployed()

    // // impersonate the TVK treasury
    // await hre.network.provider.request({
    //     method: "hardhat_impersonateAccount",
    //     params: [TVK_TREASURY_ADDRESS]}
    // )

    // const tvkSigner = await ethers.provider.getSigner(TVK_TREASURY_ADDRESS)
    // const tvkTokenForWhale = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, tvkSigner)

    // // transfer 10000 TVK to first hardhat signer
    // await tvkTokenForWhale.transfer(address, '100000' + eighteenZeros)

    // await hre.network.provider.request({
    //     method: "hardhat_stopImpersonatingAccount",
    //     params: ["0x197d188218dCF572A1e5175CCdaC783ee0E6734A"]}
    // )

    // // get the TVK token contract and set allowance for TVK prestige contract
    // const tvkToken = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, signers[0])
    // await tvkToken.approve(deployedTvkPrestige.address, '100000' + eighteenZeros)

    // // change the status to bronce
    // await tvkPrestige.setStatus(address, 1, []);
    // const previousBlock = await tvkPrestige.provider.getBlockNumber()
    // // change the status to gold
    // await tvkPrestige.setStatus(address, 3, []);

    // // check with the contract
    // const status = await tvkPrestige.statusReport(address)
    // const report = tvkStatusReport(status.toString())
    // expect(report[1]).to.equal(previousBlock)
    // });
    
    // it("will change the status from higher to lower", async function(){
    // // reset the fork
    // await hre.network.provider.request({
    //     method: "hardhat_reset",
    //     params: [{
    //     forking: {
    //         jsonRpcUrl: "https://eth-mainnet.alchemyapi.io/v2/0T6PEQIu3w1qwoPoPG3XPJHvKAzXEjkv",
    //         blockNumber: 12206000
    //     }
    //     }]
    // })

    // // get first hardhat signer address
    // const signers = await ethers.getSigners()
    // const address = signers[0].address;

    // // deploy TVKPrestige
    // const tvkprestigeFactory = await ethers.getContractFactory(
    //     'TVKPrestige'
    // );
    // const tvkPrestige = await tvkprestigeFactory.deploy() as TVKPrestige;
    // let deployedTvkPrestige = await tvkPrestige.deployed()

    // // impersonate the TVK treasury
    // await hre.network.provider.request({
    //     method: "hardhat_impersonateAccount",
    //     params: [TVK_TREASURY_ADDRESS]}
    // )

    // const tvkSigner = await ethers.provider.getSigner(TVK_TREASURY_ADDRESS)
    // const tvkTokenForWhale = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, tvkSigner)

    // // transfer 10000 TVK to first hardhat signer
    // await tvkTokenForWhale.transfer(address, '100000' + eighteenZeros)

    // await hre.network.provider.request({
    //     method: "hardhat_stopImpersonatingAccount",
    //     params: ["0x197d188218dCF572A1e5175CCdaC783ee0E6734A"]}
    // )

    // // get the TVK token contract and set allowance for TVK prestige contract
    // const tvkToken = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, signers[0])
    // await tvkToken.approve(deployedTvkPrestige.address, '100000' + eighteenZeros)

    // // change the status to gold
    // await tvkPrestige.setStatus(address, 3, []);
    // // change the status to bronze
    // await expect(tvkPrestige.setStatus(address, 1, []))
    // .to.emit(tvkPrestige, 'StatusChange')
    // .withArgs(address, [3, 1])
    // });
    
    // it("will return the previous block number at the current level if updating from a higher to a lower state", async function(){
    // // reset the fork
    // await hre.network.provider.request({
    //     method: "hardhat_reset",
    //     params: [{
    //     forking: {
    //         jsonRpcUrl: "https://eth-mainnet.alchemyapi.io/v2/0T6PEQIu3w1qwoPoPG3XPJHvKAzXEjkv",
    //         blockNumber: 12206000
    //     }
    //     }]
    // })

    // // get first hardhat signer address
    // const signers = await ethers.getSigners()
    // const address = signers[0].address;

    // // deploy TVKPrestige
    // const tvkprestigeFactory = await ethers.getContractFactory(
    //     'TVKPrestige'
    // );
    // const tvkPrestige = await tvkprestigeFactory.deploy() as TVKPrestige;
    // let deployedTvkPrestige = await tvkPrestige.deployed()

    // // impersonate the TVK treasury
    // await hre.network.provider.request({
    //     method: "hardhat_impersonateAccount",
    //     params: [TVK_TREASURY_ADDRESS]}
    // )

    // const tvkSigner = await ethers.provider.getSigner(TVK_TREASURY_ADDRESS)
    // const tvkTokenForWhale = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, tvkSigner)

    // // transfer 10000 TVK to first hardhat signer
    // await tvkTokenForWhale.transfer(address, '100000' + eighteenZeros)

    // await hre.network.provider.request({
    //     method: "hardhat_stopImpersonatingAccount",
    //     params: ["0x197d188218dCF572A1e5175CCdaC783ee0E6734A"]}
    // )

    // // get the TVK token contract and set allowance for TVK prestige contract
    // const tvkToken = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, signers[0])
    // await tvkToken.approve(deployedTvkPrestige.address, '100000' + eighteenZeros)

    // // change the status to gold
    // await tvkPrestige.setStatus(address, 3, []);
    // const previousBlock = await tvkPrestige.provider.getBlockNumber();
    // // change the status to bronze
    // await tvkPrestige.setStatus(address, 1, []);

    // // check with the contract
    // const status = await tvkPrestige.statusReport(address)
    // const report = tvkStatusReport(status.toString())
    // expect(report[1]).to.equal(previousBlock)
    // });
    
    // it("will be possible to know the previous status from the current status", async function(){
    // // reset the fork
    // await hre.network.provider.request({
    //     method: "hardhat_reset",
    //     params: [{
    //     forking: {
    //         jsonRpcUrl: "https://eth-mainnet.alchemyapi.io/v2/0T6PEQIu3w1qwoPoPG3XPJHvKAzXEjkv",
    //         blockNumber: 12206000
    //     }
    //     }]
    // })

    // // get first hardhat signer address
    // const signers = await ethers.getSigners()
    // const address = signers[0].address;

    // // deploy TVKPrestige
    // const tvkprestigeFactory = await ethers.getContractFactory(
    //     'TVKPrestige'
    // );
    // const tvkPrestige = await tvkprestigeFactory.deploy() as TVKPrestige;
    // let deployedTvkPrestige = await tvkPrestige.deployed()

    // // impersonate the TVK treasury
    // await hre.network.provider.request({
    //     method: "hardhat_impersonateAccount",
    //     params: [TVK_TREASURY_ADDRESS]}
    // )

    // const tvkSigner = await ethers.provider.getSigner(TVK_TREASURY_ADDRESS)
    // const tvkTokenForWhale = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, tvkSigner)

    // // transfer 10000 TVK to first hardhat signer
    // await tvkTokenForWhale.transfer(address, '100000' + eighteenZeros)

    // await hre.network.provider.request({
    //     method: "hardhat_stopImpersonatingAccount",
    //     params: ["0x197d188218dCF572A1e5175CCdaC783ee0E6734A"]}
    // )

    // // get the TVK token contract and set allowance for TVK prestige contract
    // const tvkToken = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, signers[0])
    // await tvkToken.approve(deployedTvkPrestige.address, '100000' + eighteenZeros)

    // // change the status to gold
    // await tvkPrestige.setStatus(address,  1, []);
    // const previousBlock = await tvkPrestige.provider.getBlockNumber();
    // // change the status to bronze
    // await tvkPrestige.setStatus(address, 3, []);

    // // check with the contract
    // const status = await tvkPrestige.statusReport(address)
    // const report = tvkStatusReport(status.toString())
    // expect(report[1]).to.equal(previousBlock)
    // });

    // it("will return the original block number if status 0 is called again", async function(){
    // // reset the fork
    // await hre.network.provider.request({
    //     method: "hardhat_reset",
    //     params: [{
    //     forking: {
    //         jsonRpcUrl: "https://eth-mainnet.alchemyapi.io/v2/0T6PEQIu3w1qwoPoPG3XPJHvKAzXEjkv",
    //         blockNumber: 12206000
    //     }
    //     }]
    // })

    // // get first hardhat signer address
    // const signers = await ethers.getSigners()
    // const address = signers[0].address;

    // // deploy TVKPrestige
    // const tvkprestigeFactory = await ethers.getContractFactory(
    //     'TVKPrestige'
    // );
    // const tvkPrestige = await tvkprestigeFactory.deploy() as TVKPrestige;
    // let deployedTvkPrestige = await tvkPrestige.deployed()

    // // impersonate the TVK treasury
    // await hre.network.provider.request({
    //     method: "hardhat_impersonateAccount",
    //     params: [TVK_TREASURY_ADDRESS]}
    // )

    // const tvkSigner = await ethers.provider.getSigner(TVK_TREASURY_ADDRESS)
    // const tvkTokenForWhale = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, tvkSigner)

    // // transfer 10000 TVK to first hardhat signer
    // await tvkTokenForWhale.transfer(address, '100000' + eighteenZeros)

    // await hre.network.provider.request({
    //     method: "hardhat_stopImpersonatingAccount",
    //     params: ["0x197d188218dCF572A1e5175CCdaC783ee0E6734A"]}
    // )

    // // get the TVK token contract and set allowance for TVK prestige contract
    // const tvkToken = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, signers[0])
    // await tvkToken.approve(deployedTvkPrestige.address, '100000' + eighteenZeros)

    // // change the status to silver
    // await tvkPrestige.setStatus(address,  2, []);
    // const originalBlock = await tvkPrestige.provider.getBlockNumber();
    // // change the status to copper
    // await tvkPrestige.setStatus(address, 0, []);

    // // check with the contract
    // const status = await tvkPrestige.statusReport(address)
    // const report = tvkStatusReport(status.toString())
    // expect(report[0]).to.equal(originalBlock)
    // });

    // it("will return original block number at current status and the rest at 0 after two continuous decrements", async function(){
    // // reset the fork
    // await hre.network.provider.request({
    //     method: "hardhat_reset",
    //     params: [{
    //     forking: {
    //         jsonRpcUrl: "https://eth-mainnet.alchemyapi.io/v2/0T6PEQIu3w1qwoPoPG3XPJHvKAzXEjkv",
    //         blockNumber: 12206000
    //     }
    //     }]
    // })

    // // get first hardhat signer address
    // const signers = await ethers.getSigners()
    // const address = signers[0].address;

    // // deploy TVKPrestige
    // const tvkprestigeFactory = await ethers.getContractFactory(
    //     'TVKPrestige'
    // );
    // const tvkPrestige = await tvkprestigeFactory.deploy() as TVKPrestige;
    // let deployedTvkPrestige = await tvkPrestige.deployed()

    // // impersonate the TVK treasury
    // await hre.network.provider.request({
    //     method: "hardhat_impersonateAccount",
    //     params: [TVK_TREASURY_ADDRESS]}
    // )

    // const tvkSigner = await ethers.provider.getSigner(TVK_TREASURY_ADDRESS)
    // const tvkTokenForWhale = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, tvkSigner)

    // // transfer 10000 TVK to first hardhat signer
    // await tvkTokenForWhale.transfer(address, '100000' + eighteenZeros)

    // await hre.network.provider.request({
    //     method: "hardhat_stopImpersonatingAccount",
    //     params: ["0x197d188218dCF572A1e5175CCdaC783ee0E6734A"]}
    // )

    // // get the TVK token contract and set allowance for TVK prestige contract
    // const tvkToken = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, signers[0])
    // await tvkToken.approve(deployedTvkPrestige.address, '100000' + eighteenZeros)

    // // change the status to platinum
    // await tvkPrestige.setStatus(address,  3, []);
    // const originalBlock = await tvkPrestige.provider.getBlockNumber();

    // // change the status to gold
    // await tvkPrestige.setStatus(address, 2, []);
    // // change the status to bronze
    // await tvkPrestige.setStatus(address, 1, []);

    // // check with the contract
    // const status = await tvkPrestige.statusReport(address)
    // const report = tvkStatusReport(status.toString())
    // expect(report[3]).to.equal(0)
    // expect(report[2]).to.equal(0)
    // expect(report[1]).to.equal(originalBlock)
    // });

    // it("will return two different block numbers if two consecutive increments occur, the high bits will be 0", async function(){
    // // reset the fork
    // await hre.network.provider.request({
    //     method: "hardhat_reset",
    //     params: [{
    //     forking: {
    //         jsonRpcUrl: "https://eth-mainnet.alchemyapi.io/v2/0T6PEQIu3w1qwoPoPG3XPJHvKAzXEjkv",
    //         blockNumber: 12206000
    //     }
    //     }]
    // })

    // // get first hardhat signer address
    // const signers = await ethers.getSigners()
    // const address = signers[0].address;

    // // deploy TVKPrestige
    // const tvkprestigeFactory = await ethers.getContractFactory(
    //     'TVKPrestige'
    // );
    // const tvkPrestige = await tvkprestigeFactory.deploy() as TVKPrestige;
    // let deployedTvkPrestige = await tvkPrestige.deployed()

    // // impersonate the TVK treasury
    // await hre.network.provider.request({
    //     method: "hardhat_impersonateAccount",
    //     params: [TVK_TREASURY_ADDRESS]}
    // )

    // const tvkSigner = await ethers.provider.getSigner(TVK_TREASURY_ADDRESS)
    // const tvkTokenForWhale = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, tvkSigner)

    // // transfer 10000 TVK to first hardhat signer
    // await tvkTokenForWhale.transfer(address, '100000' + eighteenZeros)

    // await hre.network.provider.request({
    //     method: "hardhat_stopImpersonatingAccount",
    //     params: ["0x197d188218dCF572A1e5175CCdaC783ee0E6734A"]}
    // )

    // // get the TVK token contract and set allowance for TVK prestige contract
    // const tvkToken = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, signers[0])
    // await tvkToken.approve(deployedTvkPrestige.address, '100000' + eighteenZeros)

    // // change the status to platinum
    // await tvkPrestige.setStatus(address,  2, []);

    // // change the status to gold
    // await tvkPrestige.setStatus(address, 4, []);

    // // check with the contract
    // const status = await tvkPrestige.statusReport(address);
    // const report = tvkStatusReport(status.toString());
    // assert(report[0] === report[1]);
    // assert(report[1] === report[2]);
    // assert(report[2] < report[3]);
    // assert(report[3] === report[4]);
    // expect(report[5]).to.equal(0);
    // expect(report[6]).to.equal(0);
    // expect(report[7]).to.equal(0);
    // });
    
})