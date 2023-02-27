import { assert } from "chai";
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
  basicDeploy,
  readWriteTierDeploy,
  redeemableERC20DeployClone,
  redeemableERC20DeployImplementation,
  Tier,
} from "../../utils";
import { erc20PulleeDeploy } from "../../utils/deploy/test/erc20Pullee/deploy";
import { reserveDeploy } from "../../utils/deploy/test/reserve/deploy";

describe("RedeemableERC20 transfer test", async function () {
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
    cloneFactory = (await basicDeploy("CloneFactory", {})) as CloneFactory;
  });

  beforeEach(async () => {
    reserve = await reserveDeploy();
  });

  it("should enforce 'hub and spoke' pattern for sending and receiving tokens during distribution phase", async function () {
    // Copied from `RedeemableERC20.sol`
    //
    // Receivers act as "hubs" that can send to "spokes".
    // i.e. any address of the minimum tier.
    // Spokes cannot send tokens another "hop" e.g. to each other.
    // Spokes can only send back to a receiver (doesn't need to be
    // the same receiver they received from).

    const TEN_TOKENS = ethers.BigNumber.from("10" + Util.eighteenZeros);

    const signers = await ethers.getSigners();

    const [owner, aliceReceiver, bobReceiver, carolSpoke, daveSpoke] = signers;

    // Constructing the RedeemableERC20 sets the parameters but nothing stateful happens.

    const minimumTier = Tier.ONE;

    // spokes above min tier
    await tier.setTier(carolSpoke.address, Tier.THREE);
    await tier.setTier(daveSpoke.address, Tier.THREE);

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
      minimumTier,
      distributionEndForwardingAddress: ethers.constants.AddressZero,
    };

    const token = await redeemableERC20DeployClone(
      owner,
      cloneFactory,
      implementation,
      redeemableConfig
    );

    await Util.assertError(
      async () =>
        await token.connect(aliceReceiver).transfer(bobReceiver.address, 1),
      "2SPOKE",
      "alice sent tokens despite not being a 'receiver'"
    );

    // grant roles for receivers
    await erc20Pullee.grantReceiver(token.address, aliceReceiver.address);
    await erc20Pullee.grantReceiver(token.address, bobReceiver.address);

    // give some tokens
    await erc20Pullee.transfer(
      token.address,
      aliceReceiver.address,
      TEN_TOKENS
    );
    await erc20Pullee.transfer(token.address, bobReceiver.address, TEN_TOKENS);
    await erc20Pullee.transfer(token.address, carolSpoke.address, TEN_TOKENS);
    await erc20Pullee.transfer(token.address, daveSpoke.address, TEN_TOKENS);

    // 'hub' sends to 'spoke'
    await token.connect(aliceReceiver).transfer(carolSpoke.address, 1);
    const carolSpokeBalance0 = await token.balanceOf(carolSpoke.address);
    assert(carolSpokeBalance0.eq(TEN_TOKENS.add(1)));

    // 'spoke' sends to 'hub'
    await token.connect(carolSpoke).transfer(aliceReceiver.address, 1);
    const aliceReceiverBalance0 = await token.balanceOf(aliceReceiver.address);
    assert(aliceReceiverBalance0.eq(TEN_TOKENS));

    // 'spoke' sends to 'spoke' -> should fail
    await Util.assertError(
      async () =>
        await token.connect(carolSpoke).transfer(daveSpoke.address, 1),
      "2SPOKE",
      "carol wrongly sent tokens to dave (another spoke)"
    );

    // 'spoke' sends to another 'hub'
    await token.connect(carolSpoke).transfer(bobReceiver.address, 1);
    const bobReceiverBalance0 = await token.balanceOf(bobReceiver.address);
    assert(bobReceiverBalance0.eq(TEN_TOKENS.add(1)));

    // 'hub' sends to another 'hub'
    await token.connect(aliceReceiver).transfer(bobReceiver.address, 1);
    const bobReceiverBalance1 = await token.balanceOf(bobReceiver.address);
    assert(bobReceiverBalance1.eq(bobReceiverBalance0.add(1)));
  });

  it("should prevent tokens being sent to self (when user should be redeeming)", async function () {
    const signers = await ethers.getSigners();

    // Constructing the RedeemableERC20 sets the parameters but nothing stateful happens.

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
      minimumTier,
      distributionEndForwardingAddress: ethers.constants.AddressZero,
    };

    const redeemableERC20 = await redeemableERC20DeployClone(
      signers[0],
      cloneFactory,
      implementation,
      redeemableConfig
    );

    // user attempts to wrongly 'redeem' by sending all of their redeemable tokens directly to contract address
    await Util.assertError(
      async () =>
        await erc20Pullee.transfer(
          redeemableERC20.address,
          redeemableERC20.address,
          await redeemableERC20.balanceOf(signers[0].address)
        ),
      "TOKEN_SEND_SELF",
      "user successfully transferred all their redeemables tokens to token contract"
    );
  });

  it("should prevent sending redeemable tokens to zero address", async function () {
    const TEN_TOKENS = ethers.BigNumber.from("10" + Util.eighteenZeros);

    const signers = await ethers.getSigners();

    const signer1 = signers[1];

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

    await tier.setTier(signer1.address, Tier.FOUR);

    const redeemableERC20 = await redeemableERC20DeployClone(
      signers[0],
      cloneFactory,
      implementation,
      redeemableConfig
    );

    await Util.assertError(
      async () =>
        await erc20Pullee.transfer(
          redeemableERC20.address,
          ethers.constants.AddressZero,
          TEN_TOKENS
        ),
      "ERC20: transfer to the zero address",
      "owner sending redeemable tokens to zero address did not error"
    );

    await erc20Pullee.transfer(
      redeemableERC20.address,
      signer1.address,
      TEN_TOKENS
    );

    await Util.assertError(
      async () =>
        await redeemableERC20
          .connect(signer1)
          .transfer(ethers.constants.AddressZero, TEN_TOKENS),
      "ERC20: transfer to the zero address",
      "signer 1 sending redeemable tokens to zero address did not error"
    );
  });
});
