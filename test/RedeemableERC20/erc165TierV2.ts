import { assert } from "chai";
import { concat, hexlify, randomBytes } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { ERC20PulleeTest, ReserveToken } from "../../typechain";
import { CombineTier, StakeFactory } from "../../typechain";
import {
  ERC20ConfigStruct,
  InitializeEvent,
} from "../../typechain/contracts/redeemableERC20/RedeemableERC20";
import { StakeConfigStruct } from "../../typechain/contracts/stake/Stake";
import * as Util from "../../utils";
import {
  AllStandardOps,
  assertError,
  basicDeploy,
  combineTierDeploy,
  compareStructs,
  getEventArgs,
  max_uint256,
  stakeDeploy,
  Tier,
} from "../../utils";
import { rainterpreterDeploy } from "../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployerDeploy } from "../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import { stakeFactoryDeploy } from "../../utils/deploy/stake/stakeFactory/deploy";
import { erc20PulleeDeploy } from "../../utils/deploy/test/erc20Pullee/deploy";
import { reserveDeploy } from "../../utils/deploy/test/reserve/deploy";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../utils/interpreter/interpreter";
const Opcode = AllStandardOps;

describe("RedeemableERC20 ERC165_TierV2 test", async function () {
  let erc20Pullee: ERC20PulleeTest;
  let reserve: ReserveToken;
  let redeemableERC20Config: ERC20ConfigStruct;
  let stakeFactory: StakeFactory;

  before(async () => {
    stakeFactory = await stakeFactoryDeploy();

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
  const ctxAccount = op(Opcode.CONTEXT, 0x0000);

  // prettier-ignore
  // return default report
  const sourceReportTimeForTierDefault = concat([
      op(Opcode.CONTEXT, 0x0001),
      ctxAccount,
    op(Opcode.ITIERV2_REPORT),
  ]);

  it("should pass ERC165 check by passing a CombineTier contract inheriting TierV2", async () => {
    const signers = await ethers.getSigners();

    const tier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      expressionConfig: {
        sources: [
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
          sourceReportTimeForTierDefault,
        ],
        constants: [0],
      },
      expressionDeployer: "",
      interpreter: "",
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

    const interpreter = await rainterpreterDeploy();
    const expressionDeployer = await rainterpreterExpressionDeployerDeploy(
      interpreter
    );

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: reserveToken.address,
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      expressionConfig: {
        sources: [
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
        ],
        constants: [max_uint256],
      },
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
      async () => await Util.redeemableERC20Deploy(signers[0], tokenConfig),
      "ERC165_TIERV2",
      "ERC165_TIERV2 check failed"
    );
  });
});
