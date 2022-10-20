import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { StandardIntegrity } from "../../typechain";
import { AllStandardOpsTest } from "../../typechain";
import { CombineTier } from "../../typechain";
import type { ReserveToken } from "../../typechain";
import { StakeFactory } from "../../typechain";
import * as Util from "../../utils";
import {
  AllStandardOps,
  assertError,
  basicDeploy,
  combineTierDeploy,
  compareStructs,
  getEventArgs,
  stakeDeploy,
  Tier,
} from "../../utils";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../utils/interpreter/interpreter";
import type { ERC20PulleeTest } from "../../typechain";
import {
  ERC20ConfigStruct,
  InitializeEvent,
} from "../../typechain/contracts/redeemableERC20/RedeemableERC20";
import { StakeConfigStruct } from "../../typechain/contracts/stake/Stake";
import { reserveDeploy } from "../../utils/deploy/test/reserve/deploy";
import { allStandardOpsDeploy } from "../../utils/deploy/test/allStandardOps/deploy";
import { stakeFactoryDeploy } from "../../utils/deploy/stake/stakeFactory/deploy";
import { erc20PulleeDeploy } from "../../utils/deploy/test/erc20Pullee/deploy";
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
      op(Opcode.THIS_ADDRESS),
      ctxAccount,
    op(Opcode.ITIERV2_REPORT),
  ]);

  it("should pass ERC165 check by passing a CombineTier contract inheriting TierV2", async () => {
    const signers = await ethers.getSigners();

    const tier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
          sourceReportTimeForTierDefault,
        ],
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

  it("should fail ERC165 check by passing invalid contract not inheriting TierV2", async () => {
    const signers = await ethers.getSigners();

    const tier = await allStandardOpsDeploy();

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
