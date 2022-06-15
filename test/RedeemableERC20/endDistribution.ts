import { assert } from "chai";
import type { Contract } from "ethers";
import { ethers } from "hardhat";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import type { ReserveToken } from "../../typechain/ReserveToken";
import * as Util from "../../utils";
import { Phase } from "../../utils/types/redeemableERC20";

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

describe("RedeemableERC20 endDistribution test", async function () {
  it("should only allow sender with DISTRIBUTOR_BURNER role to call endDistribution", async function () {
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

    assert(
      (await redeemableERC20.currentPhase()).eq(Phase.DISTRIBUTING),
      `default phase was not phase ONE, got ${await redeemableERC20.currentPhase()}`
    );

    const redeemableERC201 = new ethers.Contract(
      redeemableERC20.address,
      redeemableERC20.interface,
      signers[1]
    );

    await Util.assertError(
      async () => await redeemableERC201.endDistribution(signers[0].address),
      "ONLY_ADMIN",
      "was wrongly able to set phase block with insuffient role permissions"
    );

    await erc20Pullee.endDistribution(redeemableERC20.address, Util.oneAddress);
  });
});
