import { assert } from "chai";
import { ethers } from "hardhat";
import { ERC20PulleeTest } from "../../typechain/contracts/test/redeemableERC20/RedeemableERC20/ERC20PulleeTest";
import { ReserveToken } from "../../typechain/contracts/test/testToken/ReserveToken";
import { ReadWriteTier } from "../../typechain/contracts/test/tier/TierV2/ReadWriteTier";
import * as Util from "../../utils";
import { readWriteTierDeploy, Tier } from "../../utils";
import { erc20PulleeDeploy } from "../../utils/deploy/test/erc20Pullee/deploy";
import { reserveDeploy } from "../../utils/deploy/test/reserve/deploy";

describe("RedeemableERC20 constructor test", async function () {
  let erc20Pullee: ERC20PulleeTest;
  let tier: ReadWriteTier;
  let reserve: ReserveToken;

  before(async () => {
    erc20Pullee = await erc20PulleeDeploy();
    tier = await readWriteTierDeploy();
  });

  beforeEach(async () => {
    reserve = await reserveDeploy();
  });

  it("should have 18 decimals", async () => {
    const signers = await ethers.getSigners();

    const minimumTier = Tier.FOUR;

    const totalSupply = ethers.BigNumber.from("5000" + Util.eighteenZeros);
    const redeemableERC20Config = {
      name: "RedeemableERC20",
      symbol: "RDX",
      distributor: erc20Pullee.address,
      initialSupply: totalSupply,
    };

    const token = await Util.redeemableERC20Deploy(signers[0], {
      reserve: reserve.address,
      erc20Config: redeemableERC20Config,
      tier: tier.address,
      minimumTier,
      distributionEndForwardingAddress: ethers.constants.AddressZero,
    });

    // token has 18 decimals
    const decimals = await token.decimals();
    assert(decimals === 18, `expected 18 decimals, got ${decimals}`);
  });

  it("should fail to construct redeemable token if too few minted tokens", async function () {
    const signers = await ethers.getSigners();

    const minimumTier = 0;

    const totalTokenSupplyZero = ethers.BigNumber.from(
      "0" + Util.eighteenZeros
    );
    const totalTokenSupplyOneShort = ethers.BigNumber.from(
      "1" + Util.eighteenZeros
    ).sub(1);
    const totalTokenSupplyMinimum = ethers.BigNumber.from(
      "1" + Util.eighteenZeros
    );

    const redeemableERC20ConfigZero = {
      name: "RedeemableERC20",
      symbol: "RDX",
      distributor: erc20Pullee.address,
      initialSupply: totalTokenSupplyZero,
    };
    const redeemableERC20ConfigOneShort = {
      name: "RedeemableERC20",
      symbol: "RDX",
      distributor: erc20Pullee.address,
      initialSupply: totalTokenSupplyOneShort,
    };
    const redeemableERC20ConfigMinimum = {
      name: "RedeemableERC20",
      symbol: "RDX",
      distributor: erc20Pullee.address,
      initialSupply: totalTokenSupplyMinimum,
    };

    await Util.assertError(
      async () =>
        await Util.redeemableERC20Deploy(signers[0], {
          reserve: reserve.address,
          erc20Config: redeemableERC20ConfigZero,
          tier: tier.address,
          minimumTier,
          distributionEndForwardingAddress: ethers.constants.AddressZero,
        }),
      `MINIMUM_INITIAL_SUPPLY`,
      `failed to error when constructed with 0 total supply`
    );

    await Util.assertError(
      async () =>
        await Util.redeemableERC20Deploy(signers[0], {
          reserve: reserve.address,
          erc20Config: redeemableERC20ConfigOneShort,
          tier: tier.address,
          minimumTier,
          distributionEndForwardingAddress: ethers.constants.AddressZero,
        }),
      `MINIMUM_INITIAL_SUPPLY`,
      `failed to error when constructed with 0 total supply`
    );

    await Util.redeemableERC20Deploy(signers[0], {
      reserve: reserve.address,
      erc20Config: redeemableERC20ConfigMinimum,
      tier: tier.address,
      minimumTier,
      distributionEndForwardingAddress: ethers.constants.AddressZero,
    });
  });

  it("should set owner as unfreezable on construction", async function () {
    const signers = await ethers.getSigners();

    const minimumTier = Tier.FOUR;

    const totalSupply = ethers.BigNumber.from("5000" + Util.eighteenZeros);
    const redeemableERC20Config = {
      name: "RedeemableERC20",
      symbol: "RDX",
      distributor: erc20Pullee.address,
      initialSupply: totalSupply,
    };

    const redeemableERC20 = await Util.redeemableERC20Deploy(signers[0], {
      reserve: reserve.address,
      erc20Config: redeemableERC20Config,
      tier: tier.address,
      minimumTier: minimumTier,
      distributionEndForwardingAddress: ethers.constants.AddressZero,
    });

    assert(
      await redeemableERC20.isReceiver(erc20Pullee.address),
      "owner not set as receiver on token construction"
    );
  });

  it("should allow token transfers in constructor regardless of owner tier level", async function () {
    const signers = await ethers.getSigners();

    // Constructing the RedeemableERC20 sets the parameters but nothing stateful happens.

    // Set owner to COPPER status, lower than minimum status of DIAMOND
    await tier.setTier(erc20Pullee.address, Tier.ONE);

    const minimumTier = Tier.SIX;

    const totalSupply = ethers.BigNumber.from("5000" + Util.eighteenZeros);
    const redeemableERC20Config = {
      name: "RedeemableERC20",
      symbol: "RDX",
      distributor: erc20Pullee.address,
      initialSupply: totalSupply,
    };

    const redeemableERC20 = await Util.redeemableERC20Deploy(signers[0], {
      reserve: reserve.address,
      erc20Config: redeemableERC20Config,
      tier: tier.address,
      minimumTier: minimumTier,
      distributionEndForwardingAddress: ethers.constants.AddressZero,
    });

    // admin is made receiver during construction, so required token transfers can go ahead
    assert(
      await redeemableERC20.isReceiver(erc20Pullee.address),
      "admin not made receiver during construction"
    );

    await erc20Pullee.endDistribution(redeemableERC20.address, Util.oneAddress);

    await reserve.transfer(redeemableERC20.address, 1);
  });
});
