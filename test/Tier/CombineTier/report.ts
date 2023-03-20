/* eslint-disable no-unexpected-multiline */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  CloneFactory,
  CombineTier,
  IInterpreterV1Consumer,
  Rainterpreter,
  ReadWriteTier,
  ReserveToken,
} from "../../../typechain";
import {
  Stake,
  StakeConfigStruct,
} from "../../../typechain/contracts/stake/Stake";
import {
  basicDeploy,
  getBlockTimestamp,
  max_uint256,
  readWriteTierDeploy,
  stakeCloneDeploy,
  stakeImplementation,
  THRESHOLDS,
  Tier,
  timewarp,
} from "../../../utils";
import { flowCloneFactory } from "../../../utils/deploy/factory/cloneFactory";
import { rainterpreterDeploy } from "../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";

import { expressionConsumerDeploy } from "../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { reserveDeploy } from "../../../utils/deploy/test/reserve/deploy";
import {
  combineTierCloneDeploy,
  combineTierImplementation,
} from "../../../utils/deploy/tier/combineTier/deploy";
import {
  generateEvaluableConfig,
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import { ALWAYS, NEVER, numArrayToReport } from "../../../utils/tier";

const Opcode = AllStandardOps;

let signers: SignerWithAddress[];
let deployer: SignerWithAddress;
let alice: SignerWithAddress;
let bob: SignerWithAddress;
let tokenERC20: ReserveToken;
let readWriteTier: ReadWriteTier;

let rainInterpreter: Rainterpreter;
let logic: IInterpreterV1Consumer;

describe("CombineTier report tests", async function () {
  let implementationStake: Stake;
  let implementationCombineTier: CombineTier;

  let cloneFactory: CloneFactory;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementationStake = await stakeImplementation();
    implementationCombineTier = await combineTierImplementation();

    //Deploy Clone Factory
    cloneFactory = await flowCloneFactory();
  });

  const ctxAccount = op(Opcode.context, 0x0000);

  // prettier-ignore
  // return default report
  const sourceReportTimeForTierDefault = concat([
      op(Opcode.context, 0x0001),
      ctxAccount,
    op(Opcode.itier_v2_report),
  ]);

  beforeEach(async () => {
    signers = await ethers.getSigners();
    [deployer, alice, bob] = signers;

    tokenERC20 = await reserveDeploy();
    readWriteTier = await readWriteTierDeploy();
    implementationStake = await stakeImplementation();

    rainInterpreter = await rainterpreterDeploy();

    const consumerFactory = await ethers.getContractFactory(
      "IInterpreterV1Consumer"
    );
    logic = (await consumerFactory.deploy()) as IInterpreterV1Consumer;
    await logic.deployed();
  });

  it("should support a program which returns the default report", async () => {
    const evaluableConfigAlwaysTier = await generateEvaluableConfig(
      [
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
        sourceReportTimeForTierDefault,
      ],
      [ALWAYS]
    );

    const alwaysTier = await combineTierCloneDeploy(
      deployer,
      cloneFactory,
      implementationCombineTier,
      0,
      evaluableConfigAlwaysTier
    );

    const evaluableConfigNeverTier = await generateEvaluableConfig(
      [
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
        sourceReportTimeForTierDefault,
      ],
      [NEVER]
    );

    const neverTier = await combineTierCloneDeploy(
      deployer,
      cloneFactory,
      implementationCombineTier,
      0,
      evaluableConfigNeverTier
    );

    const constants = [
      ethers.BigNumber.from(alwaysTier.address),
      ethers.BigNumber.from(neverTier.address),
    ];

    // prettier-ignore
    const sourceAlwaysReport = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.context, 0x0000),
      op(Opcode.itier_v2_report, 0),
    ]);

    // prettier-ignore
    const sourceNeverReport = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.context, 0x0000),
      op(Opcode.itier_v2_report, 0),
    ]);

    const evaluableConfigAlways = await generateEvaluableConfig(
      [sourceAlwaysReport, sourceReportTimeForTierDefault],
      constants
    );

    const combineTierAlways = await combineTierCloneDeploy(
      deployer,
      cloneFactory,
      implementationCombineTier,
      1,
      evaluableConfigAlways
    );

    const resultAlwaysReport = await combineTierAlways.report(
      signers[1].address,
      []
    );

    const expectedAlwaysReport = 0;
    assert(
      resultAlwaysReport.eq(expectedAlwaysReport),
      `wrong report
      expected  ${expectedAlwaysReport}
      got       ${resultAlwaysReport}`
    );

    const evaluableConfigNever = await generateEvaluableConfig(
      [sourceNeverReport, sourceReportTimeForTierDefault],
      constants
    );
    const combineTierNever = await combineTierCloneDeploy(
      deployer,
      cloneFactory,
      implementationCombineTier,
      1,
      evaluableConfigNever
    );
    const resultNeverReport = await combineTierNever.report(
      signers[1].address,
      []
    );

    const expectedNeverReport = ethers.constants.MaxUint256;
    assert(
      resultNeverReport.eq(expectedNeverReport),
      `wrong report
      expected ${expectedNeverReport}
      got      ${resultNeverReport}`
    );
  });

  it("should query the report of another CombineTier contract using a non TierV2 contract wrapped in a CombineTier contract", async () => {
    const vAlice = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vTokenAddr = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );
    // Transferring bob
    tokenERC20.transfer(bob.address, 11);

    // ALICE
    // prettier-ignore
    const sourceTierContractAlice = concat([
      vTokenAddr,
      vAlice,
      op(Opcode.erc_20_balance_of),
    ]);

    const evaluableConfigAlice = await generateEvaluableConfig(
      [sourceTierContractAlice, sourceReportTimeForTierDefault],
      [alice.address, tokenERC20.address]
    );
    const tierContractAlice = await combineTierCloneDeploy(
      deployer,
      cloneFactory,
      implementationCombineTier,
      0,
      evaluableConfigAlice
    );

    // BOB
    // prettier-ignore
    const sourceTierContractBob = concat([
        vTokenAddr,
        vAlice,
      op(Opcode.erc_20_balance_of),
    ]);
    const evaluableConfigBob = await generateEvaluableConfig(
      [sourceTierContractBob, sourceReportTimeForTierDefault],
      [bob.address, tokenERC20.address]
    );
    const tierContractBob = await combineTierCloneDeploy(
      deployer,
      cloneFactory,
      implementationCombineTier,
      0,
      evaluableConfigBob
    );

    // MAIN
    const constants = [
      ethers.BigNumber.from(tierContractAlice.address),
      ethers.BigNumber.from(tierContractBob.address),
    ];

    // prettier-ignore
    const sourceMain = concat([
            op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
            op(Opcode.context, 0x0000),
          op(Opcode.itier_v2_report, 0),
        op(Opcode.is_zero),
          op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)),
          op(Opcode.context, 0x0000),
        op(Opcode.itier_v2_report, 0),
          op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.context, 0x0000),
        op(Opcode.itier_v2_report, 0),
      op(Opcode.eager_if)
    ]);

    const evaluableConfig = await generateEvaluableConfig(
      [sourceMain, sourceReportTimeForTierDefault],
      constants
    );

    const combineTierMain = await combineTierCloneDeploy(
      deployer,
      cloneFactory,
      implementationCombineTier,
      2,
      evaluableConfig
    );

    const result0 = await combineTierMain.report(signers[1].address, []);

    const expected0 = 11;

    assert(
      result0.eq(expected0),
      `wrong report
      expected  ${expected0}
      got       ${result0}`
    );

    // Transferring tokens to Alice
    tokenERC20.transfer(alice.address, 1);
    const result1 = await combineTierMain.report(signers[1].address, []);

    const expected1 = 1;

    assert(
      result1.eq(expected1),
      `wrong report
      expected  ${expected1}
      got       ${result1}`
    );
  });

  it("should query the report of a contract inheriting TierV2", async () => {
    // Set Bob's status
    await readWriteTier.connect(bob).setTier(bob.address, Tier.ONE);
    const expectedResultBob = await readWriteTier.report(bob.address, []);

    // MAIN
    const constants = [
      ethers.BigNumber.from(readWriteTier.address),
      max_uint256,
    ];

    // prettier-ignore
    const sourceAliceReport = concat([
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)), // Alice's Report
        op(Opcode.context, 0x0100),
      op(Opcode.itier_v2_report),
    ])

    // prettier-ignore
    const sourceBobReport = concat([
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)), // Bob's Report
        op(Opcode.context, 0x0200),
      op(Opcode.itier_v2_report),
    ])

    // The source will check Alice's report if it is set [i.e] less than max_uint256, if true, return Alice's report else return Bob's report
    // prettier-ignore
    const sourceMain = concat([
           sourceAliceReport,
          op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // max_uint256
        op(Opcode.less_than),  // 0
          sourceAliceReport,
          sourceBobReport,
      op(Opcode.eager_if)
    ]);

    const evaluableConfig = await generateEvaluableConfig(
      [sourceMain, sourceReportTimeForTierDefault],
      constants
    );

    const combineTierMain = await combineTierCloneDeploy(
      deployer,
      cloneFactory,
      implementationCombineTier,
      1,
      evaluableConfig
    );

    const result0 = await combineTierMain.report(alice.address, [bob.address]);

    assert(
      result0.eq(expectedResultBob),
      `wrong report
      expected  ${expectedResultBob}
      got       ${result0}`
    );

    // Set Alice's status
    await timewarp(10);
    await readWriteTier.connect(alice).setTier(alice.address, Tier.ONE);
    const expectedResultAlice = await readWriteTier.report(alice.address, []);

    const result1 = await combineTierMain.report(alice.address, [bob.address]);

    assert(
      result1.eq(expectedResultAlice),
      `wrong report
      expected  ${expectedResultAlice}
      got       ${result1}`
    );
  });

  it("should use context to pass extra data to the CombineTier script", async () => {
    // Set Bob's status
    await readWriteTier.connect(bob).setTier(bob.address, Tier.ONE);
    const expectedResultBob = await readWriteTier.report(bob.address, []);

    await timewarp(10);
    // Set Alice's status
    await readWriteTier.connect(alice).setTier(alice.address, Tier.ONE);
    const expectedResultAlice = await readWriteTier.report(alice.address, []);

    // prettier-ignore
    const sourceAliceReport = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)), // Alice's Report
      op(Opcode.context, 0x0100),
      op(Opcode.itier_v2_report),
    ])

    // prettier-ignore
    const sourceBobReport = concat([
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)), // Bob's Report
        op(Opcode.context, 0x0201),
      op(Opcode.itier_v2_report),
    ])
    // MAIN
    const constants = [ethers.BigNumber.from(readWriteTier.address)];

    // The source will match expected reports for Alice & Bob and return True if both match
    // prettier-ignore
    const sourceMain = concat([
          sourceAliceReport,
          op(Opcode.context, 0x0200), // Alice's expected report
        op(Opcode.equal_to),
          sourceBobReport,
          op(Opcode.context, 0x0202), // Bob's expected report
        op(Opcode.equal_to),
      op(Opcode.every, 2)
    ]);

    const evaluableConfig = await generateEvaluableConfig(
      [sourceMain, sourceReportTimeForTierDefault],
      constants
    );

    const combineTierMain = await combineTierCloneDeploy(
      deployer,
      cloneFactory,
      implementationCombineTier,
      1,
      evaluableConfig
    );

    const result0 = await combineTierMain.report(alice.address, [
      expectedResultAlice,
      bob.address,
      expectedResultBob,
    ]);

    const expectedResult0 = 1;
    assert(
      result0.eq(expectedResult0),
      `wrong report
      expected  ${expectedResult0}
      got       ${result0}`
    );

    // Switching the expected results
    const result1 = await combineTierMain.report(alice.address, [
      expectedResultBob,
      bob.address,
      expectedResultAlice,
    ]);

    const expectedResult1 = 0;
    assert(
      result1.eq(expectedResult1),
      `wrong report
      expected  ${expectedResult1}
      got       ${result1}`
    );
  });

  it("should query Stake Contract's report using Combine Tier", async () => {
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
      asset: tokenERC20.address,
      evaluableConfig: evaluableConfig,
    };

    const stake = await stakeCloneDeploy(
      deployer,
      cloneFactory,
      implementationStake,
      stakeConfigStruct
    );

    // Give Alice reserve tokens and deposit them
    const depositAmount0 = THRESHOLDS[7].add(1);
    await tokenERC20.transfer(alice.address, depositAmount0);
    await tokenERC20.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);
    const blockTimeAlice_ = await getBlockTimestamp();

    const expectedReportAlice = numArrayToReport([
      blockTimeAlice_,
      blockTimeAlice_,
      blockTimeAlice_,
      blockTimeAlice_,
      blockTimeAlice_,
      blockTimeAlice_,
      blockTimeAlice_,
      blockTimeAlice_,
    ]);

    // Give Bob reserve tokens and deposit them
    await timewarp(10000);
    const depositAmount1 = THRESHOLDS[2].add(1);
    await tokenERC20.transfer(bob.address, depositAmount1);
    await tokenERC20.connect(bob).approve(stake.address, depositAmount1);
    await stake.connect(bob).deposit(depositAmount1, bob.address);
    const blockTimeBob_ = await getBlockTimestamp();

    const expectedReportBob = numArrayToReport([
      blockTimeBob_,
      blockTimeBob_,
      blockTimeBob_,
      0xffffffff,
      0xffffffff,
      0xffffffff,
      0xffffffff,
      0xffffffff,
    ]);

    // prettier-ignore
    const sourceAliceReport = concat([
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract
        op(Opcode.context, 0x0100), // alice address
        op(Opcode.context, 0x0203), // THRESHOLDS
        op(Opcode.context, 0x0204),
        op(Opcode.context, 0x0205),
        op(Opcode.context, 0x0206),
        op(Opcode.context, 0x0207),
        op(Opcode.context, 0x0208),
        op(Opcode.context, 0x0209),
        op(Opcode.context, 0x020a),
      op(Opcode.itier_v2_report, THRESHOLDS.length)
    ]);

    // prettier-ignore
    const sourceBobReport = concat([
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract
        op(Opcode.context, 0x0201), // bob address
        op(Opcode.context, 0x0203), // THRESHOLDS
        op(Opcode.context, 0x0204),
        op(Opcode.context, 0x0205),
        op(Opcode.context, 0x0206),
        op(Opcode.context, 0x0207),
        op(Opcode.context, 0x0208),
        op(Opcode.context, 0x0209),
        op(Opcode.context, 0x020a),
      op(Opcode.itier_v2_report, THRESHOLDS.length)
    ]);

    // MAIN
    // The source will match expected reports for Alice & Bob and return True if both match
    // prettier-ignore
    const sourceMain = concat([
          sourceAliceReport,
          op(Opcode.context, 0x0200), // Alice's expected report
        op(Opcode.equal_to),
          sourceBobReport,
          op(Opcode.context, 0x0202), // Bob's expected report
        op(Opcode.equal_to),
      op(Opcode.every, 2)
    ]);

    const evaluableConfigMain = await generateEvaluableConfig(
      [sourceMain, sourceReportTimeForTierDefault],
      [stake.address]
    );

    const combineTierMain = await combineTierCloneDeploy(
      deployer,
      cloneFactory,
      implementationCombineTier,
      1,
      evaluableConfigMain
    );

    const result0 = await combineTierMain.report(alice.address, [
      expectedReportAlice,
      bob.address,
      expectedReportBob,
      ...THRESHOLDS,
    ]);

    const expectedResult0 = 1;
    assert(
      result0.eq(expectedResult0),
      `wrong report
      expected  ${expectedResult0}
      got       ${result0}`
    );
  });

  it("should combine reports of 2 staking contracts", async () => {
    const evaluableConfigStakeMain = await generateEvaluableConfig(
      [
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
      ],
      [max_uint256]
    );

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: tokenERC20.address,
      evaluableConfig: evaluableConfigStakeMain,
    };

    const stake0 = await stakeCloneDeploy(
      deployer,
      cloneFactory,
      implementationStake,
      stakeConfigStruct
    );
    const stake1 = await stakeCloneDeploy(
      deployer,
      cloneFactory,
      implementationStake,
      stakeConfigStruct
    );

    // Give Alice reserve tokens and deposit them to stake0
    const depositAmount0 = THRESHOLDS[7].add(1);
    await tokenERC20.transfer(alice.address, depositAmount0);
    await tokenERC20.connect(alice).approve(stake0.address, depositAmount0);
    await stake0.connect(alice).deposit(depositAmount0, alice.address);
    const blockTimeAlice_ = await getBlockTimestamp();

    const expectedReportStake0 = numArrayToReport([
      blockTimeAlice_,
      blockTimeAlice_,
      blockTimeAlice_,
      blockTimeAlice_,
      blockTimeAlice_,
      blockTimeAlice_,
      blockTimeAlice_,
      blockTimeAlice_,
    ]);

    // prettier-ignore
    const sourceReportStake0 = concat([
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract stake0
        op(Opcode.context, 0x0100), // address
        op(Opcode.context, 0x0200), // THRESHOLDS
        op(Opcode.context, 0x0201),
        op(Opcode.context, 0x0202),
        op(Opcode.context, 0x0203),
        op(Opcode.context, 0x0204),
        op(Opcode.context, 0x0205),
        op(Opcode.context, 0x0206),
        op(Opcode.context, 0x0207),
      op(Opcode.itier_v2_report, THRESHOLDS.length)
    ]);

    // prettier-ignore
    const sourceReportStake1 = concat([
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // ITierV2 contract stake1
        op(Opcode.context, 0x0100), // address
        op(Opcode.context, 0x0200), // THRESHOLDS
        op(Opcode.context, 0x0201),
        op(Opcode.context, 0x0202),
        op(Opcode.context, 0x0203),
        op(Opcode.context, 0x0204),
        op(Opcode.context, 0x0205),
        op(Opcode.context, 0x0206),
        op(Opcode.context, 0x0207),
      op(Opcode.itier_v2_report, THRESHOLDS.length)
    ]);

    // MAIN
    // The source will check Alice's report for stake0 and stake1 contract. If valid, return stake0 report else max_uint256
    // prettier-ignore
    const sourceMain = concat([
            sourceReportStake0, // stake0 report
            op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)), // max_uint256
          op(Opcode.less_than),
            sourceReportStake1, // stake1 report
            op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)), // max_uint256
          op(Opcode.less_than),
        op(Opcode.every, 2), // Condition
        sourceReportStake0, // TRUE
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)), // FALSE
      op(Opcode.eager_if)
    ]);

    const evaluableConfigCombineTierMain = await generateEvaluableConfig(
      [sourceMain, sourceReportTimeForTierDefault],
      [stake0.address, stake1.address, max_uint256]
    );

    const combineTierMain = await combineTierCloneDeploy(
      deployer,
      cloneFactory,
      implementationCombineTier,
      2,
      evaluableConfigCombineTierMain
    );

    const result0 = await combineTierMain.report(alice.address, [
      ...THRESHOLDS,
    ]);

    const expectedResult0 = max_uint256;
    assert(
      result0.eq(expectedResult0),
      `wrong report
      expected  ${expectedResult0}
      got       ${result0}`
    );

    // Give Alice reserve tokens and deposit them to stake1
    // This will return a valid report for alice
    await timewarp(10000);
    const depositAmount1 = THRESHOLDS[2].add(1);
    await tokenERC20.transfer(alice.address, depositAmount1);
    await tokenERC20.connect(alice).approve(stake1.address, depositAmount1);
    await stake1.connect(alice).deposit(depositAmount1, alice.address);

    const result1 = await combineTierMain.report(alice.address, [
      ...THRESHOLDS,
    ]);

    const expectedResult1 = expectedReportStake0;
    assert(
      result1.eq(expectedResult1),
      `wrong report
      expected  ${expectedResult1}
      got       ${result1}`
    );
  });

  it("should combine reports of N staking contracts", async () => {
    const evaluableConfigStake = await generateEvaluableConfig(
      [
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
      ],
      [max_uint256]
    );

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: tokenERC20.address,
      evaluableConfig: evaluableConfigStake,
    };

    const MAX_STAKE_CONTRACTS = 10;
    const POSITION_max_uint256 = 10;
    const stakeContracts = [];
    const sourceReports = [];
    const constants = [];
    for (let i = 0; i < MAX_STAKE_CONTRACTS; i++) {
      stakeContracts.push(
        await stakeCloneDeploy(
          deployer,
          cloneFactory,
          implementationStake,
          stakeConfigStruct
        )
      );
      constants.push(stakeContracts[i].address);

      // Give Alice reserve tokens and deposit them to stake0, skipping the last contract to produce false condition
      if (i != MAX_STAKE_CONTRACTS - 1) {
        const depositAmount0 = THRESHOLDS[7].add(1);
        await tokenERC20.transfer(alice.address, depositAmount0);
        await tokenERC20
          .connect(alice)
          .approve(stakeContracts[i].address, depositAmount0);
        await stakeContracts[i]
          .connect(alice)
          .deposit(depositAmount0, alice.address);
      }

      // prettier-ignore
      const sourceReportStake = concat([
          op(Opcode.read_memory, memoryOperand(MemoryType.Constant, i)), // ITierV2 contract stake0
          op(Opcode.context, 0x0100), // address
          op(Opcode.context, 0x0200), // THRESHOLDS
          op(Opcode.context, 0x0201),
          op(Opcode.context, 0x0202),
          op(Opcode.context, 0x0203),
          op(Opcode.context, 0x0204),
          op(Opcode.context, 0x0205),
          op(Opcode.context, 0x0206),
          op(Opcode.context, 0x0207),
        op(Opcode.itier_v2_report, THRESHOLDS.length),
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, POSITION_max_uint256)), // max_uint256
        op(Opcode.less_than)
      ]);

      // Pushing source reports
      sourceReports.push(sourceReportStake);
    }

    // MAIN
    // The source will check Alice's report for stake0 and stake1 contract. If valid, return stake0 report else max_uint256
    // prettier-ignore
    const sourceMain = concat([
          ...sourceReports,
        op(Opcode.every, stakeContracts.length), // Condition
        sourceReports[0], // TRUE == 1
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, POSITION_max_uint256)), // FALSE == max_uint256
      op(Opcode.eager_if)
    ]);

    const evaluableConfigCombineTier = await generateEvaluableConfig(
      [sourceMain, sourceReportTimeForTierDefault],
      [...constants, max_uint256]
    );

    const combineTierMain = await combineTierCloneDeploy(
      deployer,
      cloneFactory,
      implementationCombineTier,
      stakeContracts.length,
      evaluableConfigCombineTier
    );

    const result0 = await combineTierMain.report(alice.address, [
      ...THRESHOLDS,
    ]);

    const expectedResult0 = max_uint256;
    assert(
      result0.eq(expectedResult0),
      `wrong report
      expected  ${expectedResult0}
      got       ${result0}`
    );

    // Give Alice reserve tokens and deposit them to last stake contract
    // This will return a valid report for alice
    await timewarp(10000);
    const depositAmount1 = THRESHOLDS[2].add(1);
    await tokenERC20.transfer(alice.address, depositAmount1);
    await tokenERC20
      .connect(alice)
      .approve(stakeContracts[MAX_STAKE_CONTRACTS - 1].address, depositAmount1);
    await stakeContracts[MAX_STAKE_CONTRACTS - 1]
      .connect(alice)
      .deposit(depositAmount1, alice.address);

    const result1 = await combineTierMain.report(alice.address, [
      ...THRESHOLDS,
    ]);

    const expectedResult1 = 1;
    assert(
      result1.eq(expectedResult1),
      `wrong report
      expected  ${expectedResult1}
      got       ${result1}`
    );
  });

  it("should use ITIERV2_REPORT opcode with context data to query the report for a CombineTier contract", async () => {
    const evaluableConfigStake = await generateEvaluableConfig(
      [
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
      ],
      [max_uint256]
    );

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: tokenERC20.address,
      evaluableConfig: evaluableConfigStake,
    };

    const stake0 = await stakeCloneDeploy(
      deployer,
      cloneFactory,
      implementationStake,
      stakeConfigStruct
    );
    const stake1 = await stakeCloneDeploy(
      deployer,
      cloneFactory,
      implementationStake,
      stakeConfigStruct
    );

    // Give Alice reserve tokens and deposit them to stake0
    const depositAmount0 = THRESHOLDS[7].add(1);
    await tokenERC20.transfer(alice.address, depositAmount0);
    await tokenERC20.connect(alice).approve(stake0.address, depositAmount0);
    await stake0.connect(alice).deposit(depositAmount0, alice.address);
    const blockTimeAlice_ = await getBlockTimestamp();

    const expectedReportStake0 = numArrayToReport([
      blockTimeAlice_,
      blockTimeAlice_,
      blockTimeAlice_,
      blockTimeAlice_,
      blockTimeAlice_,
      blockTimeAlice_,
      blockTimeAlice_,
      blockTimeAlice_,
    ]);

    // prettier-ignore
    const sourceReportStake0 = concat([
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract stake0
        op(Opcode.context, 0x0100), // address
        op(Opcode.context, 0x0200), // THRESHOLDS
        op(Opcode.context, 0x0201),
        op(Opcode.context, 0x0202),
        op(Opcode.context, 0x0203),
        op(Opcode.context, 0x0204),
        op(Opcode.context, 0x0205),
        op(Opcode.context, 0x0206),
        op(Opcode.context, 0x0207),
      op(Opcode.itier_v2_report, THRESHOLDS.length)
    ]);

    // prettier-ignore
    const sourceReportStake1 = concat([
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // ITierV2 contract stake1
        op(Opcode.context, 0x0100), // address
        op(Opcode.context, 0x0200), // THRESHOLDS
        op(Opcode.context, 0x0201),
        op(Opcode.context, 0x0202),
        op(Opcode.context, 0x0203),
        op(Opcode.context, 0x0204),
        op(Opcode.context, 0x0205),
        op(Opcode.context, 0x0206),
        op(Opcode.context, 0x0207),
      op(Opcode.itier_v2_report, THRESHOLDS.length)
    ]);

    // MAIN
    // The source will check Alice's report for stake0 and stake1 contract. If valid, return stake0 report else max_uint256
    // prettier-ignore
    const sourceCombineTierContract = concat([
            sourceReportStake0, // stake0 report
            op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)), // max_uint256
          op(Opcode.less_than),
            sourceReportStake1, // stake1 report
            op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)), // max_uint256
          op(Opcode.less_than),
        op(Opcode.every, 2), // Condition
        sourceReportStake0, // TRUE
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)), // FALSE
      op(Opcode.eager_if)
    ]);

    const evaluableConfigCoombineTier = await generateEvaluableConfig(
      [sourceCombineTierContract, sourceReportTimeForTierDefault],
      [stake0.address, stake1.address, max_uint256]
    );

    const combineTierMain = await combineTierCloneDeploy(
      deployer,
      cloneFactory,
      implementationCombineTier,
      2,
      evaluableConfigCoombineTier
    );

    const sourceMain = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)), // CombineTier contract
      op(Opcode.context, 0x0000), // alice address
      op(Opcode.context, 0x0001), // THRESHOLDS
      op(Opcode.context, 0x0002),
      op(Opcode.context, 0x0003),
      op(Opcode.context, 0x0004),
      op(Opcode.context, 0x0005),
      op(Opcode.context, 0x0006),
      op(Opcode.context, 0x0007),
      op(Opcode.context, 0x0008),
      op(Opcode.itier_v2_report, THRESHOLDS.length),
    ]);

    const expression0 = await expressionConsumerDeploy(
      [sourceMain],
      [combineTierMain.address],

      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      [[alice.address, ...THRESHOLDS]]
    );

    const result0 = await logic.stackTop();

    const expectedResult0 = max_uint256;
    assert(
      result0.eq(expectedResult0),
      `wrong report
      expected  ${expectedResult0}
      got       ${result0}`
    );

    // Give Alice reserve tokens and deposit them to stake1
    // This will return a valid report for alice
    await timewarp(10000);
    const depositAmount1 = THRESHOLDS[2].add(1);
    await tokenERC20.transfer(alice.address, depositAmount1);
    await tokenERC20.connect(alice).approve(stake1.address, depositAmount1);
    await stake1.connect(alice).deposit(depositAmount1, alice.address);

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      [[alice.address, ...THRESHOLDS]]
    );
    const result1 = await logic.stackTop();

    const expectedResult1 = expectedReportStake0;
    assert(
      result1.eq(expectedResult1),
      `wrong report
      expected  ${expectedResult1}
      got       ${result1}`
    );
  });
});
