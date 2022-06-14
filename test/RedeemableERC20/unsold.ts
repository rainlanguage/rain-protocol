import * as Util from "../../utils";
import { assert } from "chai";
import { ethers } from "hardhat";
import type { ReserveToken } from "../../typechain/ReserveToken";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import type {
  RedeemableERC20,
} from "../../typechain/RedeemableERC20";
import type { Contract } from "ethers";

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

describe("RedeemableERC20 unsold token test", async function () {

  it("should forward unsold RedeemableERC20 (pTKN) to non-zero forwarding address", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const forwardee = signers[2];

    const erc20PulleeFactory = await ethers.getContractFactory(
      "ERC20PulleeTest"
    );
    const erc20Pullee = await erc20PulleeFactory.deploy();
    await erc20Pullee.deployed();

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

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const redeemableERC20 = await Util.redeemableERC20Deploy(signers[0], {
      reserve: reserve.address,
      erc20Config: redeemableERC20Config,
      tier: tier.address,
      minimumTier: minimumTier,
      distributionEndForwardingAddress: forwardee.address,
    });

    const balanceDistributorBeforeBurn = await redeemableERC20.balanceOf(
      erc20Pullee.address
    );
    const balanceForwardeeBeforeBurn = await redeemableERC20.balanceOf(
      forwardee.address
    );

    await erc20Pullee.endDistribution(
      redeemableERC20.address,
      erc20Pullee.address
    );

    const balanceDistributorAfterBurn = await redeemableERC20.balanceOf(
      erc20Pullee.address
    );
    const balanceForwardeeAfterBurn = await redeemableERC20.balanceOf(
      forwardee.address
    );

    assert(balanceDistributorBeforeBurn.eq(totalSupply));
    assert(balanceForwardeeBeforeBurn.isZero());
    assert(balanceDistributorAfterBurn.isZero());
    assert(balanceForwardeeAfterBurn.eq(balanceDistributorBeforeBurn));
  });

  it("should burn unsold RedeemableERC20 (pTKN) when forwarding address set to address(0)", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const erc20PulleeFactory = await ethers.getContractFactory(
      "ERC20PulleeTest"
    );
    const erc20Pullee = await erc20PulleeFactory.deploy();
    await erc20Pullee.deployed();

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

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const redeemableERC20 = await Util.redeemableERC20Deploy(signers[0], {
      reserve: reserve.address,
      erc20Config: redeemableERC20Config,
      tier: tier.address,
      minimumTier: minimumTier,
      distributionEndForwardingAddress: ethers.constants.AddressZero,
    });

    const balanceDistributorBeforeBurn = await redeemableERC20.balanceOf(
      erc20Pullee.address
    );

    assert(balanceDistributorBeforeBurn.eq(totalSupply));

    await erc20Pullee.endDistribution(
      redeemableERC20.address,
      erc20Pullee.address
    );

    const balanceDistributorAfterBurn = await redeemableERC20.balanceOf(
      erc20Pullee.address
    );

    assert(balanceDistributorAfterBurn.isZero());

    // OZ ERC20 doesn't track address(0) balance
  });
});