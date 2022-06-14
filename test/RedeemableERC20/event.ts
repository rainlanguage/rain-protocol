import * as Util from "../../utils";
import { assert } from "chai";
import { ethers } from "hardhat";
import type { ReserveToken } from "../../typechain/ReserveToken";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import type {
  InitializeEvent,
  PhaseScheduledEvent,
  RedeemableERC20,
  RedeemEvent,
  TreasuryAssetEvent,
} from "../../typechain/RedeemableERC20";
import type { Contract } from "ethers";
import { Phase } from "../../utils/types/redeemableERC20";
import { getBlockTimestamp } from "../../utils";

enum Tier {
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

describe("RedeemableERC20 event test", async function () {

  it("should emit Initialize event", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const erc20PulleeFactory = await ethers.getContractFactory(
      "ERC20PulleeTest"
    );
    const erc20Pullee = await erc20PulleeFactory.deploy();
    await erc20Pullee.deployed();

    const reserve1 = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    // Constructing the RedeemableERC20 sets the parameters but nothing stateful happens.

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;

    const minimumTier = Tier.FOUR;

    const totalSupply = ethers.BigNumber.from("5000" + Util.eighteenZeros);
    const redeemableERC20Config = {
      name: "RedeemableERC20",
      symbol: "RDX",
      distributor: erc20Pullee.address,
      initialSupply: totalSupply,
    };

    const redeemableERC20 = await Util.redeemableERC20Deploy(signers[0], {
      reserve: reserve1.address,
      erc20Config: redeemableERC20Config,
      tier: tier.address,
      minimumTier,
      distributionEndForwardingAddress: ethers.constants.AddressZero,
    });

    const { sender, config } = (await Util.getEventArgs(
      redeemableERC20.deployTransaction,
      "Initialize",
      redeemableERC20
    )) as InitializeEvent["args"];

    assert(sender, "sender does not exist"); // redeemableERC20Factory
    assert(config.reserve === reserve1.address, "wrong reserve");
    assert(
      JSON.stringify(config.erc20Config) ===
      JSON.stringify(Object.values(redeemableERC20Config)),
      "wrong config"
    );
    assert(config.tier === tier.address, "wrong tier");
    assert(config.minimumTier.eq(minimumTier), "wrong minimumTier");
  });

  it("should emit TreasuryAsset event", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const erc20PulleeFactory = await ethers.getContractFactory(
      "ERC20PulleeTest"
    );
    const erc20Pullee = await erc20PulleeFactory.deploy();
    await erc20Pullee.deployed();

    const reserve1 = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;
    const reserve2 = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    // Constructing the RedeemableERC20 sets the parameters but nothing stateful happens.

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;

    const minimumTier = Tier.FOUR;

    const totalSupply = ethers.BigNumber.from("5000" + Util.eighteenZeros);
    const redeemableERC20Config = {
      name: "RedeemableERC20",
      symbol: "RDX",
      distributor: erc20Pullee.address,
      initialSupply: totalSupply,
    };

    const redeemableERC20 = await Util.redeemableERC20Deploy(signers[0], {
      reserve: reserve1.address,
      erc20Config: redeemableERC20Config,
      tier: tier.address,
      minimumTier,
      distributionEndForwardingAddress: ethers.constants.AddressZero,
    });

    const event0 = (await Util.getEventArgs(
      await redeemableERC20.newTreasuryAsset(reserve1.address),
      "TreasuryAsset",
      redeemableERC20
    )) as TreasuryAssetEvent["args"];

    assert(event0.sender === signers[0].address, "wrong sender in event0");
    assert(event0.asset === reserve1.address, "wrong asset in event0");

    const event1 = (await Util.getEventArgs(
      await redeemableERC20.newTreasuryAsset(reserve2.address),
      "TreasuryAsset",
      redeemableERC20
    )) as TreasuryAssetEvent["args"];

    assert(event1.sender === signers[0].address, "wrong sender in event1");
    assert(event1.asset === reserve2.address, "wrong asset in event1");

    const event2 = (await Util.getEventArgs(
      await redeemableERC20
        .connect(signers[1])
        .newTreasuryAsset(reserve1.address),
      "TreasuryAsset",
      redeemableERC20
    )) as TreasuryAssetEvent["args"];

    assert(event2.sender === signers[1].address, "wrong sender in event2");
    assert(event2.asset === reserve1.address, "wrong asset in event2");
  });

});