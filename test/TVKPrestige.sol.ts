import chai from 'chai'
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

    expect(levels[0]).to.equal(copper);
    expect(levels[1]).to.equal(bronze);
    expect(levels[2]).to.equal(silver);
    expect(levels[3]).to.equal(gold);
    expect(levels[4]).to.equal(platinum);

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
    const status = await tvkPrestige.status(signers[0].address);
    expect(status).to.equal(0);
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
    await tvkTokenForWhale.transfer(address, '10000' + eighteenZeros)

    await hre.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: ["0x197d188218dCF572A1e5175CCdaC783ee0E6734A"]}
    )

    // get the TVK token contract and set allowance for TVK prestige contract
    const tvkToken = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, signers[0])
    await tvkToken.approve(deployedTvkPrestige.address, '10000' + eighteenZeros)

    // get balance of TVK
    const balance = await tvkToken.balanceOf(address)

    // change the status to silver and check if event emitted
    await expect(tvkPrestige.set_status(address, 2))
    .to.emit(tvkPrestige, 'StatusChange')
    .withArgs(address, 0, 2)

    // check with the contract
    const status = await tvkPrestige.status(address)
    expect(status).to.equal(2, "status not updated successfully")

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
    await tvkToken.approve(deployedTvkPrestige.address, '25000' + eighteenZeros)

    // get balance of TVK
    const balance = await tvkToken.balanceOf(address)

    // change the platinum to bronze and check if event emitted
    await expect(tvkPrestige.set_status(address, 4))
    .to.emit(tvkPrestige, 'StatusChange')
    .withArgs(address, 0, 4)

    // change the status to bronze and check if event emitted
    await expect(tvkPrestige.set_status(address, 1))
    .to.emit(tvkPrestige, 'StatusChange')
    .withArgs(address, 4, 1)

    // check with the contract
    const status = await tvkPrestige.status(address)
    expect(status).to.equal(1, "status not updated successfully")

    // new balance should be the bronze level
    const levels = await tvkPrestige.levels()
    const bronze = levels[1]
    const newBalance = await tvkToken.balanceOf(address)
    expect(newBalance).to.equal(balance.sub(bronze), "new balance after status change is incorrect")
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

    await expect(tvkPrestige.set_status(address, 3)).to.be.revertedWith("revert ERC20: transfer amount exceeds balance")
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


    await expect(tvkPrestige.set_status(address, 6)).to.be.reverted
  })
});
