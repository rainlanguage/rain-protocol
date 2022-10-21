import { assert } from "chai";
import { ethers } from "hardhat";
import type {
  ERC20PulleeTest,
  ReadWriteTier,
  ReserveToken,
} from "../../typechain";
import * as Util from "../../utils";
import { readWriteTierDeploy, Tier } from "../../utils";
import { erc20PulleeDeploy } from "../../utils/deploy/test/erc20Pullee/deploy";
import { reserveDeploy } from "../../utils/deploy/test/reserve/deploy";

describe("RedeemableERC20 unsold token test", async function () {
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

  it("should forward unsold RedeemableERC20 (pTKN) to non-zero forwarding address", async function () {
    const signers = await ethers.getSigners();

    const forwardee = signers[2];

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
