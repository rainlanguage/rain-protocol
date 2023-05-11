import { strict as assert } from "assert";
import { ethers } from "hardhat";
import type {
  CloneFactory,
  ERC20PulleeTest,
  ReadWriteTier,
  ReserveToken,
} from "../../typechain";
import { NewCloneEvent } from "../../typechain/contracts/factory/CloneFactory";
import {
  InitializeEvent,
  RedeemableERC20,
  RedeemableERC20ConfigStruct,
  TreasuryAssetEvent,
} from "../../typechain/contracts/redeemableERC20/RedeemableERC20";
import * as Util from "../../utils";
import {
  getEventArgs,
  readWriteTierDeploy,
  redeemableERC20DeployClone,
  redeemableERC20DeployImplementation,
  Tier,
  zeroAddress,
} from "../../utils";
import { flowCloneFactory } from "../../utils/deploy/factory/cloneFactory";
import { erc20PulleeDeploy } from "../../utils/deploy/test/erc20Pullee/deploy";

describe("RedeemableERC20 event test", async function () {
  let erc20Pullee: ERC20PulleeTest;
  let tier: ReadWriteTier;
  let implementation: RedeemableERC20;
  let cloneFactory: CloneFactory;

  before(async () => {
    erc20Pullee = await erc20PulleeDeploy();
    tier = await readWriteTierDeploy();
    implementation = await redeemableERC20DeployImplementation();

    //Deploy Clone Factory
    cloneFactory = await flowCloneFactory();
  });

  it("should emit Initialize event", async function () {
    const reserve1 = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

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
      reserve: reserve1.address,
      erc20Config: redeemableERC20Config,
      tier: tier.address,
      minimumTier,
      distributionEndForwardingAddress: ethers.constants.AddressZero,
    };

    const encodedConfig = ethers.utils.defaultAbiCoder.encode(
      [
        "tuple(address reserve ,tuple(string name,string symbol,address distributor,uint256 initialSupply) erc20Config , address tier , uint256 minimumTier, address distributionEndForwardingAddress)",
      ],
      [redeemableConfig]
    );

    const redeemableERC20Clone = await cloneFactory.clone(
      implementation.address,
      encodedConfig
    );

    const cloneEvent = (await getEventArgs(
      redeemableERC20Clone,
      "NewClone",
      cloneFactory
    )) as NewCloneEvent["args"];

    assert(
      !(cloneEvent.clone === zeroAddress),
      "redeemableERC20 clone zero address"
    );

    const redeemableERC20 = (await ethers.getContractAt(
      "RedeemableERC20",
      cloneEvent.clone
    )) as RedeemableERC20;

    const { sender, config } = (await Util.getEventArgs(
      redeemableERC20Clone,
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
    const signers = await ethers.getSigners();

    const reserve1 = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;
    const reserve2 = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

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
      reserve: reserve1.address,
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
