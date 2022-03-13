import * as Util from "../Util";
import { ethers } from "hardhat";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import type { RedeemableERC20Reentrant } from "../../typechain/RedeemableERC20Reentrant";
import type { Contract } from "ethers";

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

    const erc20PulleeFactory = await ethers.getContractFactory(
      "ERC20PulleeTest"
    );
    const erc20Pullee = await erc20PulleeFactory.deploy();
    await erc20Pullee.deployed();

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
      distributor: erc20Pullee.address,
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
    await erc20Pullee.transfer(
      redeemableERC20.address,
      alice.address,
      FIFTY_TOKENS
    );
    // send redeemable tokens to bob
    await erc20Pullee.transfer(
      redeemableERC20.address,
      bob.address,
      FIFTY_TOKENS
    );

    await erc20Pullee.burnDistributors(redeemableERC20.address, [
      Util.oneAddress,
    ]);

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
