import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import type { RedeemableERC20Reentrant } from "../../typechain/RedeemableERC20Reentrant";
import type { Contract } from "ethers";

chai.use(solidity);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { expect, assert } = chai;

enum Tier {
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

describe("RedeemableERC20Reentrant", async function () {
  it("should guard against reentrancy if a treasury asset is malicious", async function () {
    this.timeout(0);

    const ONE_TOKEN = ethers.BigNumber.from("1" + Util.eighteenZeros);
    const FIFTY_TOKENS = ethers.BigNumber.from("50" + Util.eighteenZeros);

    const signers = await ethers.getSigners();
    const alice = signers[1];
    const bob = signers[2];

    // Constructing the RedeemableERC20 sets the parameters but nothing stateful happens.

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;

    const minimumTier = Tier.NIL;

    const maliciousReserveFactory = await ethers.getContractFactory(
      "RedeemableERC20Reentrant"
    );

    const maliciousReserve =
      (await maliciousReserveFactory.deploy()) as RedeemableERC20Reentrant &
        Contract;

    const totalSupply = ethers.BigNumber.from("5000" + Util.eighteenZeros);
    const redeemableERC20Config = {
      name: "RedeemableERC20",
      symbol: "RDX",
      distributor: signers[0].address,
      initialSupply: totalSupply,
    };

    const redeemableERC20 = await Util.redeemableERC20Deploy(signers[0], {
      reserve: maliciousReserve.address,
      erc20Config: redeemableERC20Config,
      tier: tier.address,
      minimumTier: minimumTier,
    });

    await maliciousReserve.addReentrantTarget(redeemableERC20.address);

    // send redeemable tokens to alice
    await redeemableERC20.transfer(alice.address, FIFTY_TOKENS);
    // send redeemable tokens to bob
    await redeemableERC20.transfer(bob.address, FIFTY_TOKENS);

    await redeemableERC20.burnDistributors([Util.oneAddress]);

    // theoretical pool amount being sent to redeemable token
    const reserveTotal = ethers.BigNumber.from("1000" + Util.sixZeros);

    // move all reserve tokens from pool, to become redeemables
    await maliciousReserve.transfer(redeemableERC20.address, reserveTotal);

    // replicating internal ERC20Redeem calculation
    const reserveBalance_ = await maliciousReserve.balanceOf(
      redeemableERC20.address
    );
    const totalSupply_ = await redeemableERC20.totalSupply();
    const amount_ = reserveBalance_.mul(ONE_TOKEN).div(totalSupply_);

    console.log({ amount_, reserveBalance_, ONE_TOKEN, totalSupply_ });

    await Util.assertError(
      async () =>
        await redeemableERC20
          .connect(alice)
          .redeem([maliciousReserve.address], ONE_TOKEN),
      // "ReentrancyGuard: reentrant call",
      "ZERO_AMOUNT",
      "did not guard against reentrancy attack"
    );
  });
});
