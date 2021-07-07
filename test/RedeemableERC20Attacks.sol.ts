import * as Util from "./Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import type { ReserveToken } from "../typechain/ReserveToken";
import type { Prestige } from "../typechain/Prestige";
import type { RedeemableERC20Attacker } from "../typechain/RedeemableERC20Attacker";

chai.use(solidity);
const { expect, assert } = chai;

enum Status {
  NIL,
  COPPER,
  BRONZE,
  SILVER,
  GOLD,
  PLATINUM,
  DIAMOND,
  CHAD,
  JAWAD,
}

enum Phase {
  ZERO,
  ONE,
  TWO,
  THREE,
  FOUR,
  FIVE,
  SIX,
  SEVEN,
  EIGHT,
}

describe.only("RedeemableERC20Attacks", async function () {
  it("should guard against reentrancy", async function () {
    this.timeout(0);

    const FIFTY_TOKENS = ethers.BigNumber.from("50" + Util.eighteenZeros);

    const signers = await ethers.getSigners();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    // Constructing the RedeemableERC20 sets the parameters but nothing stateful happens.

    const prestigeFactory = await ethers.getContractFactory("Prestige");
    const prestige = (await prestigeFactory.deploy()) as Prestige;

    const minimumStatus = Status.NIL;

    const redeemableERC20Factory = await ethers.getContractFactory(
      "RedeemableERC20"
    );
    const redeemableERC20AttackerFactory = await ethers.getContractFactory(
      "RedeemableERC20Attacker"
    );
    const tokenName = "RedeemableERC20";
    const tokenSymbol = "RDX";
    const totalSupply = ethers.BigNumber.from("5000" + Util.eighteenZeros);

    const now = await ethers.provider.getBlockNumber();
    const phaseOneBlock = now + 15;

    const redeemableERC20 = await redeemableERC20Factory.deploy({
      name: tokenName,
      symbol: tokenSymbol,
      prestige: prestige.address,
      minimumStatus: minimumStatus,
      totalSupply: totalSupply,
    });

    await redeemableERC20.deployed();

    const redeemableERC20Attacker = await redeemableERC20AttackerFactory.deploy(
      redeemableERC20.address
    );

    await redeemableERC20.ownerScheduleNextPhase(phaseOneBlock);
    await redeemableERC20.ownerAddRedeemable(reserve.address);

    // send redeemable tokens to attacker contract
    await redeemableERC20.transfer(
      redeemableERC20Attacker.address,
      FIFTY_TOKENS
    );

    // create a few blocks by sending some tokens around, after which redeeming now possible
    while ((await ethers.provider.getBlockNumber()) < phaseOneBlock - 1) {
      await redeemableERC20.transfer(signers[9].address, 0);
    }

    // theoretical pool amount being sent to redeemable token
    const reserveTotal = ethers.BigNumber.from("1000" + Util.eighteenZeros);

    // move all reserve tokens, to become redeemables
    await reserve.transfer(redeemableERC20.address, reserveTotal);

    console.log(
      `before attack
      redeemable  ${await redeemableERC20.balanceOf(
        redeemableERC20Attacker.address
      )}
      reserve     ${await reserve.balanceOf(redeemableERC20Attacker.address)}`
    );

    await redeemableERC20Attacker.attack();

    console.log(
      `after attack
      redeemable  ${await redeemableERC20.balanceOf(
        redeemableERC20Attacker.address
      )}
      reserve     ${await reserve.balanceOf(redeemableERC20Attacker.address)}`
    );

    throw new Error("Incomplete test");
  });
});
