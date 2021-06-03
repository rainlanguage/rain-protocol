import chai from 'chai'
import { assertError, tvkReport } from '../utils/status-report'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { TVKTier } from '../typechain/TVKTier'
import hre from 'hardhat'
import { erc20ABI } from './erc20-abi'

chai.use(solidity)
const { expect, assert } = chai

const eighteenZeros = '000000000000000000'
const TVK_CONTRACT_ADDRESS = '0xd084B83C305daFD76AE3E1b4E1F1fe2eCcCb3988'
const TVK_TREASURY_ADDRESS = '0x197d188218dCF572A1e5175CCdaC783ee0E6734A'


// check status levels
describe("Levels", async function(){
  let tvkTier : any;


  before(async () => {
    // deploy contract
    const tvkTierFactory = await ethers.getContractFactory(
      'TVKTier'
    );
    tvkTier = await tvkTierFactory.deploy() as TVKTier;
    await tvkTier.deployed()
  });

  it('will return zero tier', async function() {
    const zero = ethers.BigNumber.from(0)

    const levels = await tvkTier.levels()

    expect(levels[0]).to.equal(zero)
  })


  it("will return tier one", async function(){
    const one = ethers.BigNumber.from(0)

    const levels = await tvkTier.levels()

    expect(levels[1]).to.equal(one);
  });


  it("will return tier two", async function(){
    const two = ethers.BigNumber.from('1000' + eighteenZeros)

    const levels = await tvkTier.levels()

    expect(levels[2]).to.equal(two);
  });


  it("will return tier three", async function(){
    const three = ethers.BigNumber.from('5000' + eighteenZeros)

    // get the levels
    const levels = await tvkTier.levels()

    expect(levels[3]).to.equal(three);
  });


  it("will return tier four", async function(){
    const four = ethers.BigNumber.from('10000' + eighteenZeros)

    const levels = await tvkTier.levels()

    expect(levels[4]).to.equal(four);
  });


  it("will return tier five", async function(){
    const five = ethers.BigNumber.from('25000' + eighteenZeros)

    const levels = await tvkTier.levels()

    expect(levels[5]).to.equal(five);
  });


  it("will return tier six", async function(){
    const six = ethers.BigNumber.from('100000' + eighteenZeros)

    const levels = await tvkTier.levels()

    expect(levels[6]).to.equal(six);
  });


  it("will return tier seven", async function(){
    const seven = ethers.BigNumber.from('250000' + eighteenZeros)

    const levels = await tvkTier.levels()

    expect(levels[7]).to.equal(seven);
  });


  it("will return tier eight", async function(){
    const eight = ethers.BigNumber.from('1000000' + eighteenZeros)

    const levels = await tvkTier.levels()

    expect(levels[8]).to.equal(eight);
  });


  it("will return undefined if a non-existent level is obtained", async function(){
    const levels = await tvkTier.levels()

    expect(levels[9]).to.equal(undefined);
  });
});


describe("Account status", async function(){

  it("will take ownership of the correct amount of TVK when the new tier is higher", async function(){
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

    // deploy TVKTier
    const tvkTierFactory = await ethers.getContractFactory(
        'TVKTier'
    );
    const tvkTier = await tvkTierFactory.deploy() as TVKTier;
    let deployedTvkPrestige = await tvkTier.deployed()

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
    await tvkTier.setTier(address, 2, [])

    // new balance should be old balance less amount for silver
    const levels = await tvkTier.levels()
    const silver = levels[2]
    const newBalance = await tvkToken.balanceOf(address)
    expect(newBalance).to.equal(balance.sub(silver), "new balance after status change is incorrect")
  });

  it("will refund the correct amount of TVK when the new tier is lower", async function(){
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

    // deploy TVKTier
    const tvkTierFactory = await ethers.getContractFactory(
        'TVKTier'
    );
    const tvkTier = await tvkTierFactory.deploy() as TVKTier;
    await tvkTier.deployed()

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
    await tvkToken.approve(tvkTier.address, '35000' + eighteenZeros)

    // get balance of TVK
    const balance = await tvkToken.balanceOf(address)

    // change the tier to FOUR
    tvkTier.setTier(address, 4, [])

    // change the status to ONE
    tvkTier.setTier(address, 1, [])

    // new balance should be ONE
    const levels = await tvkTier.levels()
    const one = levels[1]
    const newBalance = await tvkToken.balanceOf(address)
    expect(newBalance).to.equal(balance.sub(one), "new balance after tier change is incorrect")
  });

  it("will revert if not enough TVK for higher tier", async function(){
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

    // deploy TVKTier
    const tvkTierFactory = await ethers.getContractFactory(
        'TVKTier'
    );
    const tvkTier = await tvkTierFactory.deploy() as TVKTier;
    await tvkTier.deployed()

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
    await tvkToken.approve(tvkTier.address, '10000' + eighteenZeros)

    await expect(tvkTier.setTier(address, 3, [])).to.be.revertedWith("revert ERC20: transfer amount exceeds balance")
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

    // deploy TVKTier
    const tvkTierFactory = await ethers.getContractFactory(
        'TVKTier'
    );
    const tvkTier = await tvkTierFactory.deploy() as TVKTier;
    await tvkTier.deployed()

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
    await tvkToken.approve(tvkTier.address, '10000' + eighteenZeros)

    assertError(
      async () => await tvkTier.setTier(address, 100, []),
      "VM Exception while processing transaction: invalid opcode",
      "failed to error for invalid status"
    )
  });

  it("will revert if invalid status code used", async function(){
    // get first hardhat signer address
    const signers = await ethers.getSigners()
    const address = signers[0].address;

    // deploy TVKTier
    const tvkTierFactory = await ethers.getContractFactory(
        'TVKTier'
    );
    const tvkTier = await tvkTierFactory.deploy() as TVKTier;
    await tvkTier.deployed()

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

    // get the TVK token contract and set allowance for TVK tier contract
    const tvkToken = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, signers[0])
    await tvkToken.approve(tvkTier.address, '10000' + eighteenZeros)

    await expect(tvkTier.setTier(address, 8, [])).to.be.reverted
  })
});
