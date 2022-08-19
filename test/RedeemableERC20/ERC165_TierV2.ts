import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { AllStandardOpsStateBuilder } from "../../typechain/AllStandardOpsStateBuilder";
import { AllStandardOpsTest } from "../../typechain/AllStandardOpsTest";
import { CombineTier } from "../../typechain/CombineTier";
import {
  ERC20ConfigStruct,
  InitializeEvent,
} from "../../typechain/RedeemableERC20";
import type { ReserveToken } from "../../typechain/ReserveToken";
import { StakeConfigStruct, StakeFactory } from "../../typechain/StakeFactory";
import * as Util from "../../utils";
import {
  AllStandardOps,
  assertError,
  basicDeploy,
  claimFactoriesDeploy,
  combineTierDeploy,
  compareStructs,
  emissionsDeploy,
  getEventArgs,
  stakeDeploy,
  Tier,
} from "../../utils";
import { op } from "../../utils/rainvm/vm";
import type { ERC20PulleeTest } from "../../typechain/ERC20PulleeTest";
const Opcode = AllStandardOps;

describe("RedeemableERC20 ERC165_TierV2 test", async function () {
  let erc20Pullee: ERC20PulleeTest;
  let reserve: ReserveToken;
  let redeemableERC20Config: ERC20ConfigStruct;
  let stateBuilder: AllStandardOpsStateBuilder;
  let logic: AllStandardOpsTest;
  let stakeFactory: StakeFactory;

  before(async () => {
    const stateBuilderFactory = await ethers.getContractFactory(
      "AllStandardOpsStateBuilder"
    );
    stateBuilder =
      (await stateBuilderFactory.deploy()) as AllStandardOpsStateBuilder;
    await stateBuilder.deployed();

    // LogicFactory
    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
    logic = (await logicFactory.deploy(
      stateBuilder.address
    )) as AllStandardOpsTest;

    // StakeFactory
    const stakeFactoryFactory = await ethers.getContractFactory(
      "StakeFactory",
      {}
    );
    stakeFactory = (await stakeFactoryFactory.deploy()) as StakeFactory;
    await stakeFactory.deployed();

    const erc20PulleeFactory = await ethers.getContractFactory(
      "ERC20PulleeTest"
    );
    erc20Pullee = (await erc20PulleeFactory.deploy()) as ERC20PulleeTest;
    await erc20Pullee.deployed();

    reserve = (await Util.basicDeploy("ReserveToken", {})) as ReserveToken;

    redeemableERC20Config = {
      name: "RedeemableERC20",
      symbol: "RDX",
      distributor: erc20Pullee.address,
      initialSupply: ethers.BigNumber.from("5000" + Util.eighteenZeros),
    };
  });

  // report time for tier context
  const ctxAccount = op(Opcode.CONTEXT, 0);

  // prettier-ignore
  // return default report
  const sourceReportTimeForTierDefault = concat([
      op(Opcode.THIS_ADDRESS),
      ctxAccount,
    op(Opcode.ITIERV2_REPORT),
  ]);

  it("should pass ERC165 check by passing a CombineTier contract inheriting TierV2", async () => {
    const signers = await ethers.getSigners();

    const tier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), sourceReportTimeForTierDefault],
        constants: [0],
      },
    })) as CombineTier;

    const minimumTier = Tier.FOUR;

    const tokenConfig = {
      reserve: reserve.address,
      erc20Config: redeemableERC20Config,
      tier: tier.address,
      minimumTier,
      distributionEndForwardingAddress: ethers.constants.AddressZero,
    };

    const token = await Util.redeemableERC20Deploy(signers[0], tokenConfig);

    const { config } = (await getEventArgs(
      token.deployTransaction,
      "Initialize",
      token
    )) as InitializeEvent["args"];

    assert(token.signer == signers[0], "wrong signer");
    compareStructs(config, tokenConfig);
  });

  it("should pass ERC165 check by passing a Stake contract inheriting TierV2", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const reserveToken = (await basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: reserveToken.address,
    };

    const tier = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    const minimumTier = Tier.FOUR;

    const tokenConfig = {
      reserve: reserve.address,
      erc20Config: redeemableERC20Config,
      tier: tier.address,
      minimumTier,
      distributionEndForwardingAddress: ethers.constants.AddressZero,
    };

    const token = await Util.redeemableERC20Deploy(signers[0], tokenConfig);

    const { config } = (await getEventArgs(
      token.deployTransaction,
      "Initialize",
      token
    )) as InitializeEvent["args"];

    assert(token.signer == signers[0], "wrong signer");
    compareStructs(config, tokenConfig);
  });

  it("should pass ERC165 check by passing an EmissionsERC20 contract inheriting TierV2", async () => {
    const signers = await ethers.getSigners();
    const creator = signers[0];

    // Deploying EmissionsERC20 contract
    const { emissionsERC20Factory } = await claimFactoriesDeploy();

    const emissionsERC20Config = {
      allowDelegatedClaims: true,
      erc20Config: {
        name: "Emissions",
        symbol: "EMS",
        distributor: signers[0].address,
        initialSupply: 0,
      },
      vmStateConfig: {
        sources: [concat([op(Opcode.CONSTANT)])],
        constants: [0],
      },
    };

    const tier = await emissionsDeploy(
      creator,
      emissionsERC20Factory,
      emissionsERC20Config
    );

    const minimumTier = Tier.FOUR;

    const tokenConfig = {
      reserve: reserve.address,
      erc20Config: redeemableERC20Config,
      tier: tier.address,
      minimumTier,
      distributionEndForwardingAddress: ethers.constants.AddressZero,
    };

    const token = await Util.redeemableERC20Deploy(signers[0], tokenConfig);

    const { config } = (await getEventArgs(
      token.deployTransaction,
      "Initialize",
      token
    )) as InitializeEvent["args"];

    assert(token.signer == signers[0], "wrong signer");
    compareStructs(config, tokenConfig);
  });

  it("should fail ERC165 check by passing invalid contract not inheriting TierV2", async () => {
    const signers = await ethers.getSigners();

    const tier = logic;

    const minimumTier = Tier.FOUR;

    const tokenConfig = {
      reserve: reserve.address,
      erc20Config: redeemableERC20Config,
      tier: tier.address,
      minimumTier,
      distributionEndForwardingAddress: ethers.constants.AddressZero,
    };

    await assertError(
      async () => await Util.redeemableERC20Deploy(signers[0], tokenConfig),
      "ERC165_TIERV2",
      "ERC165_TIERV2 check failed"
    );
  });
});
