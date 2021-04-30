import chai from 'chai'
import { tvkStatusReport } from '../utils/status-report'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { TVKPrestige } from '../typechain/TVKPrestige'
import hre from 'hardhat'
import { erc20ABI } from './erc20-abi'

chai.use(solidity)
const { expect, assert } = chai

const eighteenZeros = '000000000000000000'
const TVK_CONTRACT_ADDRESS = '0xd084B83C305daFD76AE3E1b4E1F1fe2eCcCb3988'
const TVK_TREASURY_ADDRESS = '0x197d188218dCF572A1e5175CCdaC783ee0E6734A'

// check status levels
describe("Levels", async function(){
  it("will return the correct status levels", async function(){

    // deploy contract
    const tvkprestigeFactory = await ethers.getContractFactory(
        'TVKPrestige'
    );
    const tvkPrestige = await tvkprestigeFactory.deploy() as TVKPrestige;
    await tvkPrestige.deployed()

    // get the levels
    const levels = await tvkPrestige.levels()

    // the expected levels
    const copper = ethers.BigNumber.from(0)
    const bronze = ethers.BigNumber.from('1000' + eighteenZeros)
    const silver = ethers.BigNumber.from('5000' + eighteenZeros)
    const gold = ethers.BigNumber.from('10000' + eighteenZeros)
    const platinum = ethers.BigNumber.from('25000' + eighteenZeros)
    const diamond = ethers.BigNumber.from('100000' + eighteenZeros)
    const chad = ethers.BigNumber.from('250000' + eighteenZeros)
    const jawad = ethers.BigNumber.from('1000000' + eighteenZeros)
    

    expect(levels[0]).to.equal(copper);
    expect(levels[1]).to.equal(bronze);
    expect(levels[2]).to.equal(silver);
    expect(levels[3]).to.equal(gold);
    expect(levels[4]).to.equal(platinum);
    expect(levels[5]).to.equal(diamond);
    expect(levels[6]).to.equal(chad);
    expect(levels[7]).to.equal(jawad);
  });
});

describe("Account status", async function(){

  it("will return copper status if none has been set for account", async function(){
    // reset the fork
    await hre.network.provider.request({
      method: "hardhat_reset",
      params: [{
        forking: {
          jsonRpcUrl: "https://eth-mainnet.alchemyapi.io/v2/0T6PEQIu3w1qwoPoPG3XPJHvKAzXEjkv",
          blockNumber: 12206000
        }
      }]
    })

    const signers = await ethers.getSigners();

    // deploy the contract
    const tvkprestigeFactory = await ethers.getContractFactory(
        'TVKPrestige'
    );
    const tvkPrestige = await tvkprestigeFactory.deploy() as TVKPrestige;
    await tvkPrestige.deployed()

    // no status yet, so status should be copper = 0
    const status = await tvkPrestige.statusReport(signers[0].address)
    const report = tvkStatusReport(status.toString())
    assert(report[0] === 0)
  });

  it("will return new status invalid", async function(){
    // reset the fork
    await hre.network.provider.request({
      method: "hardhat_reset",
      params: [{
        forking: {
          jsonRpcUrl: "https://eth-mainnet.alchemyapi.io/v2/0T6PEQIu3w1qwoPoPG3XPJHvKAzXEjkv",
          blockNumber: 12206000
        }
      }]
    })

    // get first hardhat signer address
    const signers = await ethers.getSigners()
    const address = signers[0].address;

    // deploy TVKPrestige
    const tvkprestigeFactory = await ethers.getContractFactory(
        'TVKPrestige'
    );
    const tvkPrestige = await tvkprestigeFactory.deploy() as TVKPrestige;
    let deployedTvkPrestige = await tvkPrestige.deployed()

    // impersonate the TVK treasury
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [TVK_TREASURY_ADDRESS]}
    )

    const tvkSigner = await ethers.provider.getSigner(TVK_TREASURY_ADDRESS)
    const tvkTokenForWhale = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, tvkSigner)

    // transfer 10000 TVK to first hardhat signer
    await tvkTokenForWhale.transfer(address, '10000' + eighteenZeros)

    await hre.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: ["0x197d188218dCF572A1e5175CCdaC783ee0E6734A"]}
    )

    // get the TVK token contract and set allowance for TVK prestige contract
    const tvkToken = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, signers[0])
    await tvkToken.approve(deployedTvkPrestige.address, '10000' + eighteenZeros)
    
    try {
      // change the status to silver and check if event emitted
      await expect(tvkPrestige.setStatus(address, 8, []))
      .to.emit(tvkPrestige, 'StatusChange')
      .withArgs(address, [0, 8])
    } catch (error) {
      assert.ok(error.message === "VM Exception while processing transaction: invalid opcode")
    }
  });

  it("will take ownership of the correct amount of TVK when the new status is higher, and emit the correct event", async function(){
    // reset the fork
    await hre.network.provider.request({
      method: "hardhat_reset",
      params: [{
        forking: {
          jsonRpcUrl: "https://eth-mainnet.alchemyapi.io/v2/0T6PEQIu3w1qwoPoPG3XPJHvKAzXEjkv",
          blockNumber: 12206000
        }
      }]
    })

    // get first hardhat signer address
    const signers = await ethers.getSigners()
    const address = signers[0].address;

    // deploy TVKPrestige
    const tvkprestigeFactory = await ethers.getContractFactory(
        'TVKPrestige'
    );
    const tvkPrestige = await tvkprestigeFactory.deploy() as TVKPrestige;
    let deployedTvkPrestige = await tvkPrestige.deployed()

    // impersonate the TVK treasury
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [TVK_TREASURY_ADDRESS]}
    )

    const tvkSigner = await ethers.provider.getSigner(TVK_TREASURY_ADDRESS)
    const tvkTokenForWhale = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, tvkSigner)

    // transfer 10000 TVK to first hardhat signer
    await tvkTokenForWhale.transfer(address, '1000000' + eighteenZeros)

    await hre.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: ["0x197d188218dCF572A1e5175CCdaC783ee0E6734A"]}
    )

    // get the TVK token contract and set allowance for TVK prestige contract
    const tvkToken = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, signers[0])
    await tvkToken.approve(deployedTvkPrestige.address, '1000000' + eighteenZeros)

    // get balance of TVK
    const balance = await tvkToken.balanceOf(address)

    // change the status to silver and check if event emitted
    await expect(tvkPrestige.setStatus(address, 2, []))
    .to.emit(tvkPrestige, 'StatusChange')
    .withArgs(address, [0, 2])

    // check with the contract
    const status = await tvkPrestige.statusReport(address)
    const report = tvkStatusReport(status.toString())
    expect(report[2]).to.equal(await tvkPrestige.provider.getBlockNumber())

    // new balance should be old balance less amount for silver
    const levels = await tvkPrestige.levels()
    const silver = levels[2]
    const newBalance = await tvkToken.balanceOf(address)
    expect(newBalance).to.equal(balance.sub(silver), "new balance after status change is incorrect")
  });

  it("will refund the correct amount of TVK when the new status is lower, and emit the correct event", async function(){
    // reset the fork
    await hre.network.provider.request({
      method: "hardhat_reset",
      params: [{
        forking: {
          jsonRpcUrl: "https://eth-mainnet.alchemyapi.io/v2/0T6PEQIu3w1qwoPoPG3XPJHvKAzXEjkv",
          blockNumber: 12206000
        }
      }]
    })

    // get first hardhat signer address
    const signers = await ethers.getSigners()
    const address = signers[0].address;

    // deploy TVKPrestige
    const tvkprestigeFactory = await ethers.getContractFactory(
        'TVKPrestige'
    );
    const tvkPrestige = await tvkprestigeFactory.deploy() as TVKPrestige;
    let deployedTvkPrestige = await tvkPrestige.deployed()

    // impersonate the TVK treasury
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [TVK_TREASURY_ADDRESS]}
    )

    const tvkSigner = await ethers.provider.getSigner(TVK_TREASURY_ADDRESS)
    const tvkTokenForWhale = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, tvkSigner)

    // transfer 10000 TVK to first hardhat signer
    await tvkTokenForWhale.transfer(address, '25000' + eighteenZeros)

    await hre.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: ["0x197d188218dCF572A1e5175CCdaC783ee0E6734A"]}
    )

    // get the TVK token contract and set allowance for TVK prestige contract
    const tvkToken = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, signers[0])
    await tvkToken.approve(deployedTvkPrestige.address, '35000' + eighteenZeros)

    // get balance of TVK
    const balance = await tvkToken.balanceOf(address)

    // change the status to platinum and check if event emitted
    await expect(tvkPrestige.setStatus(address, 4, []))
    .to.emit(tvkPrestige, 'StatusChange')
    .withArgs(address, [0, 4])

    // check with the contract
    const platinum = await tvkPrestige.statusReport(address)
    const platinumReport = tvkStatusReport(platinum.toString())[4]
    expect(platinumReport).to.equal(await tvkPrestige.provider.getBlockNumber())

    // change the status to bronze and check if event emitted
    await expect(tvkPrestige.setStatus(address, 1, []))
    .to.emit(tvkPrestige, 'StatusChange')
    .withArgs(address, [4, 1])

    // check with the contract
    const bronze = await tvkPrestige.statusReport(address)
    const bronzeReport = tvkStatusReport(bronze.toString())[1]
    expect(bronzeReport).to.equal(platinumReport)

    // new balance should be the bronze level
    const levels = await tvkPrestige.levels()
    const bronze_level = levels[1]
    const newBalance = await tvkToken.balanceOf(address)
    expect(newBalance).to.equal(balance.sub(bronze_level), "new balance after status change is incorrect")

    // Moving back up again to gold does NOT reset block number.
    await expect(tvkPrestige.setStatus(address, 3, []))
    .to.emit(tvkPrestige, 'StatusChange')
    .withArgs(address, [1, 3])

    const gold = await tvkPrestige.statusReport(address)
    const goldBlock = await tvkPrestige.provider.getBlockNumber()
    const goldReport = tvkStatusReport(gold.toString())[3]
    expect(goldReport).to.equal(await tvkPrestige.provider.getBlockNumber())
    expect(bronzeReport).to.equal(platinumReport)
    assert(bronzeReport !== goldBlock, 'block did not progress')
    assert(goldReport != bronzeReport, 'gold reset block')
    assert(goldReport == goldBlock, 'bronze -> gold reset start block')
  });

  it("will revert if not enough TVK for higher status", async function(){
    // reset the fork
    await hre.network.provider.request({
      method: "hardhat_reset",
      params: [{
        forking: {
          jsonRpcUrl: "https://eth-mainnet.alchemyapi.io/v2/0T6PEQIu3w1qwoPoPG3XPJHvKAzXEjkv",
          blockNumber: 12206000
        }
      }]
    })

    // get first hardhat signer address
    const signers = await ethers.getSigners()
    const address = signers[0].address;

    // deploy TVKPrestige
    const tvkprestigeFactory = await ethers.getContractFactory(
        'TVKPrestige'
    );
    const tvkPrestige = await tvkprestigeFactory.deploy() as TVKPrestige;
    let deployedTvkPrestige = await tvkPrestige.deployed()

    // impersonate the TVK treasury
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [TVK_TREASURY_ADDRESS]}
    )

    const tvkSigner = await ethers.provider.getSigner(TVK_TREASURY_ADDRESS)
    const tvkTokenForWhale = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, tvkSigner)

    // transfer 1000 TVK to first hardhat signer
    await tvkTokenForWhale.transfer(address, '1000' + eighteenZeros)

    await hre.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: ["0x197d188218dCF572A1e5175CCdaC783ee0E6734A"]}
    )

    // get the TVK token contract and set allowance for TVK prestige contract
    const tvkToken = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, signers[0])
    await tvkToken.approve(deployedTvkPrestige.address, '10000' + eighteenZeros)

    await expect(tvkPrestige.setStatus(address, 3, [])).to.be.revertedWith("revert ERC20: transfer amount exceeds balance")
  })


  it("will revert if invalid status code used", async function(){
    // get first hardhat signer address
    const signers = await ethers.getSigners()
    const address = signers[0].address;

    // deploy TVKPrestige
    const tvkprestigeFactory = await ethers.getContractFactory(
        'TVKPrestige'
    );
    const tvkPrestige = await tvkprestigeFactory.deploy() as TVKPrestige;
    let deployedTvkPrestige = await tvkPrestige.deployed()

    // impersonate the TVK treasury
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [TVK_TREASURY_ADDRESS]}
    )

    const tvkSigner = await ethers.provider.getSigner(TVK_TREASURY_ADDRESS)
    const tvkTokenForWhale = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, tvkSigner)

    // transfer 10000 TVK to first hardhat signer
    await tvkTokenForWhale.transfer(address, '10000' + eighteenZeros)

    await hre.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: ["0x197d188218dCF572A1e5175CCdaC783ee0E6734A"]}
    )

    // get the TVK token contract and set allowance for TVK prestige contract
    const tvkToken = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, signers[0])
    await tvkToken.approve(deployedTvkPrestige.address, '10000' + eighteenZeros)


    await expect(tvkPrestige.setStatus(address, 7, [])).to.be.reverted
  })
});
