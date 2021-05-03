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
  let tvkPrestige : any;


  before(async () => {
    // deploy contract
    const tvkprestigeFactory = await ethers.getContractFactory(
      'TVKPrestige'
    );
    tvkPrestige = await tvkprestigeFactory.deploy() as TVKPrestige;
    await tvkPrestige.deployed()
  });


  it("will return the copper status level", async function(){
    // the expected copper level
    const copper = ethers.BigNumber.from(0)

    // get the levels
    const levels = await tvkPrestige.levels()

    expect(levels[0]).to.equal(copper);
  });


  it("will return the bronze status level", async function(){
    // the expected bronze level
    const bronze = ethers.BigNumber.from('1000' + eighteenZeros)

    // get the levels
    const levels = await tvkPrestige.levels()

    expect(levels[1]).to.equal(bronze);
  });


  it("will return the silver status level", async function(){
    // the expected silver level
    const silver = ethers.BigNumber.from('5000' + eighteenZeros)

    // get the levels
    const levels = await tvkPrestige.levels()

    expect(levels[2]).to.equal(silver);
  });


  it("will return the gold status level", async function(){
    // the expected gold level
    const gold = ethers.BigNumber.from('10000' + eighteenZeros)

    // get the levels
    const levels = await tvkPrestige.levels()

    expect(levels[3]).to.equal(gold);
  });


  it("will return the platinum status level", async function(){
    // the expected platinum level
    const platinum = ethers.BigNumber.from('25000' + eighteenZeros)

    // get the levels
    const levels = await tvkPrestige.levels()

    expect(levels[4]).to.equal(platinum);
  });


  it("will return the diamond status level", async function(){
    // the expected diamond level
    const diamond = ethers.BigNumber.from('100000' + eighteenZeros)

    // get the levels
    const levels = await tvkPrestige.levels()

    expect(levels[5]).to.equal(diamond);
  });


  it("will return the chad status level", async function(){
    // the expected chad level
    const chad = ethers.BigNumber.from('250000' + eighteenZeros)
    
    // get the levels
    const levels = await tvkPrestige.levels()

    expect(levels[6]).to.equal(chad);
  });

  
  it("will return the jawad status level", async function(){
    // the expected jawad level
    const jawad = ethers.BigNumber.from('1000000' + eighteenZeros)

    // get the levels
    const levels = await tvkPrestige.levels()

    expect(levels[7]).to.equal(jawad);
  });


  it("will return undefined if a non-existent level is obtained", async function(){
    // get the levels
    const levels = await tvkPrestige.levels()

    expect(levels[8]).to.equal(undefined);
  });
});


describe("Account status", async function(){

  it("will return 0 copper status if none has been set for the account", async function(){
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


  it("will emit the status to which it was upgraded if it is upgraded for the first time", async function(){
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
    await tvkTokenForWhale.transfer(address, '5000' + eighteenZeros)

    await hre.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: ["0x197d188218dCF572A1e5175CCdaC783ee0E6734A"]}
    )

    // get the TVK token contract and set allowance for TVK prestige contract
    const tvkToken = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, signers[0])
    await tvkToken.approve(deployedTvkPrestige.address, '5000' + eighteenZeros)

    // change the status to silver and check if event emitted
    await expect(tvkPrestige.setStatus(address, 2, []))
    .to.emit(tvkPrestige, 'StatusChange')
    .withArgs(address, [0, 2])
  });


  it("will return the current block number from level 0 to the new account status if updated for the first time", async function(){
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

    // change the status to silver
    await tvkPrestige.setStatus(address, 3, []);

    // check with the contract
    const status = await tvkPrestige.statusReport(address)
    const report = tvkStatusReport(status.toString())
    const currentBlock = await tvkPrestige.provider.getBlockNumber()
    expect(report[0]).to.equal(currentBlock)
    expect(report[1]).to.equal(currentBlock)
    expect(report[2]).to.equal(currentBlock)
    expect(report[3]).to.equal(currentBlock)
  });


  it("will output the previous status level and the new updated status level", async function(){
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
    await tvkTokenForWhale.transfer(address, '100000' + eighteenZeros)

    await hre.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: ["0x197d188218dCF572A1e5175CCdaC783ee0E6734A"]}
    )

    // get the TVK token contract and set allowance for TVK prestige contract
    const tvkToken = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, signers[0])
    await tvkToken.approve(deployedTvkPrestige.address, '100000' + eighteenZeros)

    // change the status to bronce
    await tvkPrestige.setStatus(address, 1, []);
    // change the status to gold
    await expect(tvkPrestige.setStatus(address, 3, []))
    .to.emit(tvkPrestige, 'StatusChange')
    .withArgs(address, [1, 3])
  });



  it("will return the previous block number at the lower state level if it is updated to a higher state", async function(){
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
    await tvkTokenForWhale.transfer(address, '100000' + eighteenZeros)

    await hre.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: ["0x197d188218dCF572A1e5175CCdaC783ee0E6734A"]}
    )

    // get the TVK token contract and set allowance for TVK prestige contract
    const tvkToken = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, signers[0])
    await tvkToken.approve(deployedTvkPrestige.address, '100000' + eighteenZeros)

    // change the status to bronce
    await tvkPrestige.setStatus(address, 1, []);
    const previousBlock = await tvkPrestige.provider.getBlockNumber()
    // change the status to gold
    await tvkPrestige.setStatus(address, 3, []);

    // check with the contract
    const status = await tvkPrestige.statusReport(address)
    const report = tvkStatusReport(status.toString())
    expect(report[1]).to.equal(previousBlock)
  });


  it("will change the status from higher to lower", async function(){
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
    await tvkTokenForWhale.transfer(address, '100000' + eighteenZeros)

    await hre.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: ["0x197d188218dCF572A1e5175CCdaC783ee0E6734A"]}
    )

    // get the TVK token contract and set allowance for TVK prestige contract
    const tvkToken = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, signers[0])
    await tvkToken.approve(deployedTvkPrestige.address, '100000' + eighteenZeros)

    // change the status to gold
    await tvkPrestige.setStatus(address, 3, []);
    // change the status to bronze
    await expect(tvkPrestige.setStatus(address, 1, []))
    .to.emit(tvkPrestige, 'StatusChange')
    .withArgs(address, [3, 1])
  });


  it("will return the previous block number at the current level if updating from a higher to a lower state", async function(){
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
    await tvkTokenForWhale.transfer(address, '100000' + eighteenZeros)

    await hre.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: ["0x197d188218dCF572A1e5175CCdaC783ee0E6734A"]}
    )

    // get the TVK token contract and set allowance for TVK prestige contract
    const tvkToken = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, signers[0])
    await tvkToken.approve(deployedTvkPrestige.address, '100000' + eighteenZeros)

    // change the status to gold
    await tvkPrestige.setStatus(address, 3, []);
    const previousBlock = await tvkPrestige.provider.getBlockNumber();
    // change the status to bronze
    await tvkPrestige.setStatus(address, 1, []);

    // check with the contract
    const status = await tvkPrestige.statusReport(address)
    const report = tvkStatusReport(status.toString())
    expect(report[1]).to.equal(previousBlock)
  });


  it("will be possible to know the previous status from the current status", async function(){
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
    await tvkTokenForWhale.transfer(address, '100000' + eighteenZeros)

    await hre.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: ["0x197d188218dCF572A1e5175CCdaC783ee0E6734A"]}
    )

    // get the TVK token contract and set allowance for TVK prestige contract
    const tvkToken = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, signers[0])
    await tvkToken.approve(deployedTvkPrestige.address, '100000' + eighteenZeros)

    // change the status to gold
    await tvkPrestige.setStatus(address,  1, []);
    const previousBlock = await tvkPrestige.provider.getBlockNumber();
    // change the status to bronze
    await tvkPrestige.setStatus(address, 3, []);

    // check with the contract
    const status = await tvkPrestige.statusReport(address)
    const report = tvkStatusReport(status.toString())
    expect(report[1]).to.equal(previousBlock)
  });


  it("will return the original block number if status 0 is called again", async function(){
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
    await tvkTokenForWhale.transfer(address, '100000' + eighteenZeros)

    await hre.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: ["0x197d188218dCF572A1e5175CCdaC783ee0E6734A"]}
    )

    // get the TVK token contract and set allowance for TVK prestige contract
    const tvkToken = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, signers[0])
    await tvkToken.approve(deployedTvkPrestige.address, '100000' + eighteenZeros)

    // change the status to silver
    await tvkPrestige.setStatus(address,  2, []);
    const originalBlock = await tvkPrestige.provider.getBlockNumber();
    // change the status to copper
    await tvkPrestige.setStatus(address, 0, []);

    // check with the contract
    const status = await tvkPrestige.statusReport(address)
    const report = tvkStatusReport(status.toString())
    expect(report[0]).to.equal(originalBlock)
  });


  it("will return original block number at current status and the rest at 0 after two continuous decrements", async function(){
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
    await tvkTokenForWhale.transfer(address, '100000' + eighteenZeros)

    await hre.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: ["0x197d188218dCF572A1e5175CCdaC783ee0E6734A"]}
    )

    // get the TVK token contract and set allowance for TVK prestige contract
    const tvkToken = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, signers[0])
    await tvkToken.approve(deployedTvkPrestige.address, '100000' + eighteenZeros)

    // change the status to platinum
    await tvkPrestige.setStatus(address,  3, []);
    const originalBlock = await tvkPrestige.provider.getBlockNumber();

    // change the status to gold
    await tvkPrestige.setStatus(address, 2, []);
    // change the status to bronze
    await tvkPrestige.setStatus(address, 1, []);

    // check with the contract
    const status = await tvkPrestige.statusReport(address)
    const report = tvkStatusReport(status.toString())
    expect(report[3]).to.equal(0)
    expect(report[2]).to.equal(0)
    expect(report[1]).to.equal(originalBlock)
  });


  it("will return two different block numbers if two consecutive increments occur, the high bits will be 0", async function(){
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
    await tvkTokenForWhale.transfer(address, '100000' + eighteenZeros)

    await hre.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: ["0x197d188218dCF572A1e5175CCdaC783ee0E6734A"]}
    )

    // get the TVK token contract and set allowance for TVK prestige contract
    const tvkToken = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, signers[0])
    await tvkToken.approve(deployedTvkPrestige.address, '100000' + eighteenZeros)

    // change the status to platinum
    await tvkPrestige.setStatus(address,  2, []);

    // change the status to gold
    await tvkPrestige.setStatus(address, 4, []);

    // check with the contract
    const status = await tvkPrestige.statusReport(address);
    const report = tvkStatusReport(status.toString());
    assert(report[2] !== report[4]);
    expect(report[5]).to.equal(0);
    expect(report[6]).to.equal(0);
    expect(report[7]).to.equal(0);
  });


  it("will take ownership of the correct amount of TVK when the new status is higher", async function(){
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

    // change the status to silver
    tvkPrestige.setStatus(address, 2, [])
    
    // new balance should be old balance less amount for silver
    const levels = await tvkPrestige.levels()
    const silver = levels[2]
    const newBalance = await tvkToken.balanceOf(address)
    expect(newBalance).to.equal(balance.sub(silver), "new balance after status change is incorrect")
  });


  it("will refund the correct amount of TVK when the new status is lower", async function(){
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

    // change the status to platinum
    tvkPrestige.setStatus(address, 4, [])

    // change the status to bronze
    tvkPrestige.setStatus(address, 1, [])

    // new balance should be the bronze level
    const levels = await tvkPrestige.levels()
    const bronze_level = levels[1]
    const newBalance = await tvkToken.balanceOf(address)
    expect(newBalance).to.equal(balance.sub(bronze_level), "new balance after status change is incorrect")
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
      await expect(tvkPrestige.setStatus(address, 100, []))
      .to.emit(tvkPrestige, 'StatusChange')
      .withArgs(address, [0, 100])
    } catch (error) {
      assert.ok(error.message === "VM Exception while processing transaction: invalid opcode")
    }
  });


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


    await expect(tvkPrestige.setStatus(address, 8, [])).to.be.reverted
  })
});
