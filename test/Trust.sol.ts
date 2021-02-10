import { ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import type { Trust } from "../typechain/Trust"
import type { ReserveToken } from "../typechain/ReserveToken"
import type { BFactory } from "../typechain/BFactory"
import type { CRPFactory } from "../typechain/CRPFactory"

chai.use(solidity);
const { expect, assert } = chai;

const tokenJson = require ('../artifacts/contracts/TrustToken.sol/TrustToken.json')

const basicDeploy = async (name, libs, address) => {
  const factory = await ethers.getContractFactory(
    name,
    {
      libraries: libs
    },
  )

  const contract = (await factory.deploy())

  await contract.deployed()

  assert.equal(contract.address, address)

  return contract
}

describe("Trust", async function() {
  it("should create tokens", async function() {
    this.timeout(0)

    const signers = await ethers.getSigners();

    const safeMath = await basicDeploy("BalancerSafeMath", {}, '0x5FbDB2315678afecb367f032d93F642f64180aa3')
    const rightsManager = await basicDeploy("RightsManager", {}, '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512')
    const smartPoolManager = await basicDeploy("SmartPoolManager", {}, '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0')

    const bFactory = await basicDeploy("BFactory", {}, '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9') as BFactory

    const crpFactory = await basicDeploy("CRPFactory", {
      "BalancerSafeMath": safeMath.address,
      "RightsManager": rightsManager.address,
      "SmartPoolManager": smartPoolManager.address,
    }, '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9') as CRPFactory

    const reserve = await basicDeploy("ReserveToken", {}, '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707') as ReserveToken

    const trustFactory = await ethers.getContractFactory(
      "Trust",
      signers[0],
    )

    const tokenDefinition = {
        initialSupply: 50,
        name: "token A",
        symbol: "TKNA",
    }

    const reserveDeposit = {
      reserveToken: reserve.address,
      lockedAmount: 10000,
      poolAmount: 25,
    }
    const normalizedApprovalAmount = ethers.BigNumber.from(
      (BigInt(reserveDeposit.lockedAmount) * BigInt(Math.pow(10, (await reserve.decimals())))).toString()
    )
    console.log(normalizedApprovalAmount)

    const unlockBlock = 30

    const trust = (await trustFactory.deploy()) as Trust

    await trust.deployed()

    assert.equal(trust.address, '0x0165878A594ca255338adfa4d48449f69242Eb8F')

    console.log(`Approving ${ethers.constants.MaxUint256} for ${trust.address} from ${signers[0].address}`)
    await reserve["increaseAllowance(address,uint256)"](trust.address, ethers.constants.MaxUint256)
    // await reserve.approve(trust.address, 100)

    // console.log(signers[0])

    console.log((await reserve.allowance(signers[0].address, trust.address)).toString())

    console.log('about to init')

    await trust.init(tokenDefinition, reserveDeposit, unlockBlock, {
      gasLimit: ethers.BigNumber.from('100000000')
    })

    const token = await trust.token()

    assert.equal(token, '0x3B02fF1e626Ed7a8fd6eC5299e2C54e1421B626B')

    const tokenContract = new ethers.Contract(token, tokenJson.abi, signers[0])

    assert.equal("token A", await tokenContract.name())
    assert.equal("TKNA", await tokenContract.symbol())
    assert.equal(18, await tokenContract.decimals())
    assert.equal(BigInt(50000000000000000000).toString(), (await tokenContract.totalSupply()).toString())
    assert.equal(
      BigInt(50000000000000000000).toString(),
      (await tokenContract.balanceOf(trust.address)).toString()
    )

  })
});
