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

  it('will return the nil status level', async function() {
    // the expected nil level
    const nil = ethers.BigNumber.from(0)

    // get the levels
    const levels = await tvkPrestige.levels()

    expect(levels[0]).to.equal(nil)
  })


  it("will return the copper status level", async function(){
    // the expected copper level
    const copper = ethers.BigNumber.from(0)

    // get the levels
    const levels = await tvkPrestige.levels()

    expect(levels[1]).to.equal(copper);
  });


  it("will return the bronze status level", async function(){
    // the expected bronze level
    const bronze = ethers.BigNumber.from('1000' + eighteenZeros)

    // get the levels
    const levels = await tvkPrestige.levels()

    expect(levels[2]).to.equal(bronze);
  });


  it("will return the silver status level", async function(){
    // the expected silver level
    const silver = ethers.BigNumber.from('5000' + eighteenZeros)

    // get the levels
    const levels = await tvkPrestige.levels()

    expect(levels[3]).to.equal(silver);
  });


  it("will return the gold status level", async function(){
    // the expected gold level
    const gold = ethers.BigNumber.from('10000' + eighteenZeros)

    // get the levels
    const levels = await tvkPrestige.levels()

    expect(levels[4]).to.equal(gold);
  });


  it("will return the platinum status level", async function(){
    // the expected platinum level
    const platinum = ethers.BigNumber.from('25000' + eighteenZeros)

    // get the levels
    const levels = await tvkPrestige.levels()

    expect(levels[5]).to.equal(platinum);
  });


  it("will return the diamond status level", async function(){
    // the expected diamond level
    const diamond = ethers.BigNumber.from('100000' + eighteenZeros)

    // get the levels
    const levels = await tvkPrestige.levels()

    expect(levels[6]).to.equal(diamond);
  });


  it("will return the chad status level", async function(){
    // the expected chad level
    const chad = ethers.BigNumber.from('250000' + eighteenZeros)

    // get the levels
    const levels = await tvkPrestige.levels()

    expect(levels[7]).to.equal(chad);
  });


  it("will return the jawad status level", async function(){
    // the expected jawad level
    const jawad = ethers.BigNumber.from('1000000' + eighteenZeros)

    // get the levels
    const levels = await tvkPrestige.levels()

    expect(levels[8]).to.equal(jawad);
  });


  it("will return undefined if a non-existent level is obtained", async function(){
    // get the levels
    const levels = await tvkPrestige.levels()

    expect(levels[9]).to.equal(undefined);
  });
});


describe("Account status", async function(){

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
      assert(
        error.message.includes("VM Exception while processing transaction: invalid opcode"),
        'wrong error message: ' + error.message
      )
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
