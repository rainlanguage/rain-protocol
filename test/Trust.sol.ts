import { ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import type { Trust } from "../typechain/Trust"
import type { ReserveToken } from "../typechain/ReserveToken"

chai.use(solidity);
const { expect, assert } = chai;

const tokenJson = require ('../artifacts/contracts/TrustToken.sol/TrustToken.json')

describe("Trust", () => {
  it("should create tokens", async() => {
    const signers = await ethers.getSigners();

    const reserveFactory = await ethers.getContractFactory(
      "ReserveToken",
      signers[0],
    )

    const reserve = (await reserveFactory.deploy()) as ReserveToken

    await reserve.deployed()

    assert.equal(reserve.address, '0x5FbDB2315678afecb367f032d93F642f64180aa3')

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

    const unlockBlock = 30

    const trust = (await trustFactory.deploy(tokenDefinition, reserveDeposit, unlockBlock)) as Trust

    await trust.deployed()

    assert.equal(trust.address, '0x5FbDB2315678afecb367f032d93F642f64180aa3')

    const token = await trust.token()

    assert.equal(token, '0xa16E02E87b7454126E5E10d957A927A7F5B5d2be')

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
