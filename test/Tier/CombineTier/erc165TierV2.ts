import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { CombineTier } from "../../../typechain";
import {
  ReserveToken,
  StakeFactory,
  StandardIntegrity,
} from "../../../typechain";
import { StakeConfigStruct } from "../../../typechain/contracts/stake/Stake";
import { InitializeEvent } from "../../../typechain/contracts/tier/CombineTier";
import {
  basicDeploy,
  compareStructs,
  getEventArgs,
  stakeDeploy,
} from "../../../utils";
import { combineTierDeploy } from "../../../utils/deploy/combineTier";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { ALWAYS } from "../../../utils/tier";

const Opcode = AllStandardOps;

describe("CombineTier ERC165 Test", async function () {
  let integrity: StandardIntegrity;
  // let logic: AllStandardOpsTest;
  let stakeFactory: StakeFactory;

  before(async () => {
    const integrityFactory = await ethers.getContractFactory(
      "StandardIntegrity"
    );
    integrity = (await integrityFactory.deploy()) as StandardIntegrity;
    await integrity.deployed();

    // LogicFactory
    // const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
    // logic = (await logicFactory.deploy(
    //   integrity.address
    // )) as AllStandardOpsTest;

    // StakeFactory
    const stakeFactoryFactory = await ethers.getContractFactory(
      "StakeFactory",
      {}
    );
    stakeFactory = (await stakeFactoryFactory.deploy()) as StakeFactory;
    await stakeFactory.deployed();
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

    const combineTierContract = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
          sourceReportTimeForTierDefault,
        ],
        constants: [ALWAYS],
      },
    })) as CombineTier;

    const constants = [ethers.BigNumber.from(combineTierContract.address)];

    // prettier-ignore
    const sourceReport = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant,0)),
        op(Opcode.CONTEXT, 0),
      op(Opcode.ITIERV2_REPORT, 0),
    ]);

    const combineTierSourceConfig = {
      sources: [sourceReport, sourceReportTimeForTierDefault],
      constants,
    };

    const combineTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 1,
      sourceConfig: combineTierSourceConfig,
    })) as CombineTier;

    const { config } = (await getEventArgs(
      combineTier.deployTransaction,
      "Initialize",
      combineTier
    )) as InitializeEvent["args"];

    assert(combineTier.signer == signers[0], "wrong signer");
    compareStructs(config, combineTierSourceConfig);
  });

  it("should pass ERC165 check by passing a Stake contract inheriting TierV2", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const token = (await basicDeploy("ReserveToken", {})) as ReserveToken;

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    const constants = [ethers.BigNumber.from(stake.address)];

    // prettier-ignore
    const sourceReport = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant,0)),
        op(Opcode.CONTEXT, 0),
      op(Opcode.ITIERV2_REPORT, 0),
    ]);

    const combineTierSourceConfig = {
      sources: [sourceReport, sourceReportTimeForTierDefault],
      constants,
    };

    const combineTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 1,
      sourceConfig: combineTierSourceConfig,
    })) as CombineTier;

    const { config } = (await getEventArgs(
      combineTier.deployTransaction,
      "Initialize",
      combineTier
    )) as InitializeEvent["args"];

    assert(combineTier.signer == signers[0], "wrong signer");
    compareStructs(config, combineTierSourceConfig);
  });
});
