import { strict as assert } from "assert";
import { ethers } from "hardhat";
import type {
  CloneFactory,
  ERC20PulleeTest,
  ReadWriteTier,
  RedeemableERC20,
  ReserveToken,
} from "../../typechain";
import { RedeemableERC20ConfigStruct } from "../../typechain/contracts/redeemableERC20/RedeemableERC20";
import * as Util from "../../utils";
import {
  readWriteTierDeploy,
  redeemableERC20DeployClone,
  redeemableERC20DeployImplementation,
  Tier,
} from "../../utils";
import { flowCloneFactory } from "../../utils/deploy/factory/cloneFactory";
import { erc20PulleeDeploy } from "../../utils/deploy/test/erc20Pullee/deploy";
import { reserveDeploy } from "../../utils/deploy/test/reserve/deploy";

describe("RedeemableERC20 unsold token test", async function () {
  let erc20Pullee: ERC20PulleeTest;
  let tier: ReadWriteTier;
  let reserve: ReserveToken;
  let cloneFactory: CloneFactory;
  let implementation: RedeemableERC20;

  before(async () => {
    erc20Pullee = await erc20PulleeDeploy();
    tier = await readWriteTierDeploy();
    implementation = await redeemableERC20DeployImplementation();

    //Deploy Clone Factory
    cloneFactory = await flowCloneFactory();
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

    const redeemableConfig: RedeemableERC20ConfigStruct = {
      reserve: reserve.address,
      erc20Config: redeemableERC20Config,
      tier: tier.address,
      minimumTier: minimumTier,
      distributionEndForwardingAddress: forwardee.address,
    };

    const redeemableERC20 = await redeemableERC20DeployClone(
      signers[0],
      cloneFactory,
      implementation,
      redeemableConfig
    );

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

    const redeemableConfig: RedeemableERC20ConfigStruct = {
      reserve: reserve.address,
      erc20Config: redeemableERC20Config,
      tier: tier.address,
      minimumTier: minimumTier,
      distributionEndForwardingAddress: ethers.constants.AddressZero,
    };
    const redeemableERC20 = await redeemableERC20DeployClone(
      signers[0],
      cloneFactory,
      implementation,
      redeemableConfig
    );

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
