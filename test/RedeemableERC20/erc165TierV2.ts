import { assert } from "chai";
import { concat, hexlify, randomBytes } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  CloneFactory,
  ERC20PulleeTest,
  ReserveToken,
} from "../../typechain";
import { CombineTier } from "../../typechain";
import {
  ERC20ConfigStruct,
  InitializeEvent,
  RedeemableERC20,
} from "../../typechain/contracts/redeemableERC20/RedeemableERC20";
import {
  Stake,
  StakeConfigStruct,
} from "../../typechain/contracts/stake/Stake";
import * as Util from "../../utils";
import {
  AllStandardOps,
  assertError,
  basicDeploy,
  combineTierCloneDeploy,
  combineTierImplementation,
  compareStructs,
  getEventArgs,
  max_uint256,
  redeemableERC20DeployClone,
  redeemableERC20DeployImplementation,
  stakeCloneDeploy,
  stakeImplementation,
  Tier,
} from "../../utils";
import deploy1820 from "../../utils/deploy/registry1820/deploy";

import { erc20PulleeDeploy } from "../../utils/deploy/test/erc20Pullee/deploy";
import { reserveDeploy } from "../../utils/deploy/test/reserve/deploy";
import {
  generateEvaluableConfig,
  memoryOperand,
  MemoryType,
  op,
} from "../../utils/interpreter/interpreter";
const Opcode = AllStandardOps;

describe("RedeemableERC20 ERC165_TierV2 test", async function () {
  let erc20Pullee: ERC20PulleeTest;
  let reserve: ReserveToken;
  let redeemableERC20Config: ERC20ConfigStruct;
  let implementationStake: Stake;
  let implementationRedeemableERC20: RedeemableERC20;
  let implementationCombineTier: CombineTier;

  let cloneFactory: CloneFactory;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementationStake = await stakeImplementation();
    implementationRedeemableERC20 = await redeemableERC20DeployImplementation();
    implementationCombineTier = await combineTierImplementation();

    //Deploy Clone Factory
    cloneFactory = (await basicDeploy("CloneFactory", {})) as CloneFactory;

    erc20Pullee = await erc20PulleeDeploy();

    reserve = await reserveDeploy();

    redeemableERC20Config = {
      name: "RedeemableERC20",
      symbol: "RDX",
      distributor: erc20Pullee.address,
      initialSupply: ethers.BigNumber.from("5000" + Util.eighteenZeros),
    };
  });

  // report time for tier context
  const ctxAccount = op(Opcode.context, 0x0000);

  // prettier-ignore
  // return default report
  const sourceReportTimeForTierDefault = concat([
      op(Opcode.context, 0x0001),
      ctxAccount,
    op(Opcode.itier_v2_report),
  ]);

  it("should pass ERC165 check by passing a CombineTier contract inheriting TierV2", async () => {
    const signers = await ethers.getSigners();
    const evaluableConfig = await generateEvaluableConfig(
      [
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
        sourceReportTimeForTierDefault,
      ],
      [0]
    );
    const tier = await combineTierCloneDeploy(
      signers[0],
      cloneFactory,
      implementationCombineTier,
      0,
      evaluableConfig
    );

    const minimumTier = Tier.FOUR;

    const tokenConfig = {
      reserve: reserve.address,
      erc20Config: redeemableERC20Config,
      tier: tier.address,
      minimumTier,
      distributionEndForwardingAddress: ethers.constants.AddressZero,
    };

    const token = await redeemableERC20DeployClone(
      signers[0],
      cloneFactory,
      implementationRedeemableERC20,
      tokenConfig
    );

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

    const evaluableConfig = await generateEvaluableConfig(
      [
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
      ],
      [max_uint256]
    );

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: reserveToken.address,
      evaluableConfig,
    };

    const tier = await stakeCloneDeploy(
      deployer,
      cloneFactory,
      implementationStake,
      stakeConfigStruct
    );

    const minimumTier = Tier.FOUR;

    const tokenConfig = {
      reserve: reserve.address,
      erc20Config: redeemableERC20Config,
      tier: tier.address,
      minimumTier,
      distributionEndForwardingAddress: ethers.constants.AddressZero,
    };

    const token = await redeemableERC20DeployClone(
      deployer,
      cloneFactory,
      implementationRedeemableERC20,
      tokenConfig
    );
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

    const tier = hexlify(randomBytes(20));

    const minimumTier = Tier.FOUR;

    const tokenConfig = {
      reserve: reserve.address,
      erc20Config: redeemableERC20Config,
      tier: tier,
      minimumTier,
      distributionEndForwardingAddress: ethers.constants.AddressZero,
    };

    await assertError(
      async () =>
        await redeemableERC20DeployClone(
          signers[0],
          cloneFactory,
          implementationRedeemableERC20,
          tokenConfig
        ),
      `BadTierV2`,
      "ERC165_TIERV2 check failed"
    );
  });
});
