/* eslint-disable no-unexpected-multiline */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  CombineTier,
  IInterpreterV1Consumer,
  Rainterpreter,
  ReadWriteTier,
  ReserveToken,
  StakeFactory,
} from "../../../typechain";
import { StakeConfigStruct } from "../../../typechain/contracts/stake/Stake";
import {
  getBlockTimestamp,
  max_uint256,
  readWriteTierDeploy,
  stakeDeploy,
  THRESHOLDS,
  Tier,
  timewarp,
} from "../../../utils";
import { rainterpreterDeploy } from "../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployer } from "../../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import { stakeFactoryDeploy } from "../../../utils/deploy/stake/stakeFactory/deploy";
import { expressionDeployConsumer } from "../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { reserveDeploy } from "../../../utils/deploy/test/reserve/deploy";
import { combineTierDeploy } from "../../../utils/deploy/tier/combineTier/deploy";
import {
  DEBUG_0,
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
let stakeFactory: StakeFactory;
let rainInterpreter: Rainterpreter;
let logic: IInterpreterV1Consumer;

describe("CombineTier report tests", async function () {
  const ctxAccount = op(Opcode.CONTEXT, 0x0000);

  // prettier-ignore
  // return default report
  const sourceReportTimeForTierDefault = concat([
      op(Opcode.CONTEXT, 0x0001),
      ctxAccount,
    op(Opcode.ITIERV2_REPORT),
  ]);

  beforeEach(async () => {
    signers = await ethers.getSigners();
    deployer = signers[1];
    alice = signers[1];
    bob = signers[2];

    tokenERC20 = await reserveDeploy();
    readWriteTier = await readWriteTierDeploy();
    stakeFactory = await stakeFactoryDeploy();
    rainInterpreter = await rainterpreterDeploy();

    const consumerFactory = await ethers.getContractFactory(
      "IInterpreterV1Consumer"
    );
    logic = (await consumerFactory.deploy()) as IInterpreterV1Consumer;
    await logic.deployed();
  });

  it("should support a program which returns the default report", async () => {
    const alwaysTier = (await combineTierDeploy(deployer, {
      combinedTiersLength: 0,
      stateConfig: {
        sources: [
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
          sourceReportTimeForTierDefault,
        ],
        constants: [ALWAYS],
      },
      expressionDeployer: "",
      interpreter: "",
    })) as CombineTier;
    const neverTier = (await combineTierDeploy(deployer, {
      combinedTiersLength: 0,
      stateConfig: {
        sources: [
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
          sourceReportTimeForTierDefault,
        ],
        constants: [NEVER],
      },
      expressionDeployer: "",
      interpreter: "",
    })) as CombineTier;

    const constants = [
      ethers.BigNumber.from(alwaysTier.address),
      ethers.BigNumber.from(neverTier.address),
    ];

    // prettier-ignore
    const sourceAlwaysReport = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.CONTEXT, 0x0000),
      op(Opcode.ITIERV2_REPORT, 0),
    ]);

    // prettier-ignore
    const sourceNeverReport = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.CONTEXT, 0x0000),
      op(Opcode.ITIERV2_REPORT, 0),
    ]);

    const combineTierAlways = (await combineTierDeploy(deployer, {
      combinedTiersLength: 1,
      stateConfig: {
        sources: [sourceAlwaysReport, sourceReportTimeForTierDefault],
        constants,
      },
      expressionDeployer: "",
      interpreter: "",
    })) as CombineTier;

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

    const combineTierNever = (await combineTierDeploy(deployer, {
      combinedTiersLength: 1,
      stateConfig: {
        sources: [sourceNeverReport, sourceReportTimeForTierDefault],
        constants,
      },
      expressionDeployer: "",
      interpreter: "",
    })) as CombineTier;

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
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vTokenAddr = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );
    // Transferring bob
    tokenERC20.transfer(bob.address, 11);

    // ALICE
    // prettier-ignore
    const sourceTierContractAlice = concat([
      vTokenAddr,
      vAlice,
      op(Opcode.ERC20_BALANCE_OF),
    ]);

    const tierContractAlice = (await combineTierDeploy(deployer, {
      combinedTiersLength: 0,
      stateConfig: {
        sources: [sourceTierContractAlice, sourceReportTimeForTierDefault],
        constants: [alice.address, tokenERC20.address],
      },
      expressionDeployer: "",
      interpreter: "",
    })) as CombineTier;

    // BOB
    // prettier-ignore
    const sourceTierContractBob = concat([
        vTokenAddr,
        vAlice,
      op(Opcode.ERC20_BALANCE_OF),
    ]);

    const tierContractBob = (await combineTierDeploy(deployer, {
      combinedTiersLength: 0,
      stateConfig: {
        sources: [sourceTierContractBob, sourceReportTimeForTierDefault],
        constants: [bob.address, tokenERC20.address],
      },
      expressionDeployer: "",
      interpreter: "",
    })) as CombineTier;

    // MAIN
    const constants = [
      ethers.BigNumber.from(tierContractAlice.address),
      ethers.BigNumber.from(tierContractBob.address),
    ];

    // prettier-ignore
    const sourceMain = concat([
            op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
            op(Opcode.CONTEXT, 0x0000),
          op(Opcode.ITIERV2_REPORT, 0),
        op(Opcode.ISZERO),
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
          op(Opcode.CONTEXT, 0x0000),
        op(Opcode.ITIERV2_REPORT, 0),
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.CONTEXT, 0x0000),
        op(Opcode.ITIERV2_REPORT, 0),
      op(Opcode.EAGER_IF)
    ]);

    const combineTierMain = (await combineTierDeploy(deployer, {
      combinedTiersLength: 2,
      stateConfig: {
        sources: [sourceMain, sourceReportTimeForTierDefault],
        constants,
      },
      expressionDeployer: "",
      interpreter: "",
    })) as CombineTier;

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
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // Alice's Report
        op(Opcode.CONTEXT, 0x0000),
      op(Opcode.ITIERV2_REPORT),
    ])

    // prettier-ignore
    const sourceBobReport = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // Bob's Report
        op(Opcode.CONTEXT, 0x0100),
      op(Opcode.ITIERV2_REPORT),
    ])

    // The source will check Alice's report if it is set [i.e] less than max_uint256, if true, return Alice's report else return Bob's report
    // prettier-ignore
    const sourceMain = concat([
           sourceAliceReport,
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // max_uint256
        op(Opcode.LESS_THAN),  // 0
          sourceAliceReport,
          sourceBobReport,
      op(Opcode.EAGER_IF)
    ]);

    const combineTierMain = (await combineTierDeploy(deployer, {
      combinedTiersLength: 1,
      stateConfig: {
        sources: [sourceMain, sourceReportTimeForTierDefault],
        constants,
      },
      expressionDeployer: "",
      interpreter: "",
    })) as CombineTier;

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
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // Alice's Report
      op(Opcode.CONTEXT, 0x0000),
      op(Opcode.ITIERV2_REPORT),
    ])

    // prettier-ignore
    const sourceBobReport = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // Bob's Report
        op(Opcode.CONTEXT, 0x0101),
      op(Opcode.ITIERV2_REPORT),
    ])
    // MAIN
    const constants = [ethers.BigNumber.from(readWriteTier.address)];

    // The source will match expected reports for Alice & Bob and return True if both match
    // prettier-ignore
    const sourceMain = concat([
          sourceAliceReport,
          op(Opcode.CONTEXT, 0x0100), // Alice's expected report
        op(Opcode.EQUAL_TO),
          sourceBobReport,
          op(Opcode.CONTEXT, 0x0102), // Bob's expected report
        op(Opcode.EQUAL_TO),
      op(Opcode.EVERY, 2)
    ]);

    const combineTierMain = (await combineTierDeploy(deployer, {
      combinedTiersLength: 1,
      stateConfig: {
        sources: [sourceMain, sourceReportTimeForTierDefault],
        constants,
      },
      expressionDeployer: "",
      interpreter: "",
    })) as CombineTier;

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
    const interpreter = await rainterpreterDeploy();
    const expressionDeployer = await rainterpreterExpressionDeployer(
      interpreter
    );

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: tokenERC20.address,
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      stateConfig: {
        sources: [
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
        ],
        constants: [max_uint256],
      },
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

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
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract
        op(Opcode.CONTEXT, 0x0000), // alice address
        op(Opcode.CONTEXT, 0x0103), // THRESHOLDS
        op(Opcode.CONTEXT, 0x0104),
        op(Opcode.CONTEXT, 0x0105),
        op(Opcode.CONTEXT, 0x0106),
        op(Opcode.CONTEXT, 0x0107),
        op(Opcode.CONTEXT, 0x0108),
        op(Opcode.CONTEXT, 0x0109),
        op(Opcode.CONTEXT, 0x010a),
      op(Opcode.ITIERV2_REPORT, THRESHOLDS.length)
    ]);

    // prettier-ignore
    const sourceBobReport = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract
        op(Opcode.CONTEXT, 0x0101), // bob address
        op(Opcode.CONTEXT, 0x0103), // THRESHOLDS
        op(Opcode.CONTEXT, 0x0104),
        op(Opcode.CONTEXT, 0x0105),
        op(Opcode.CONTEXT, 0x0106),
        op(Opcode.CONTEXT, 0x0107),
        op(Opcode.CONTEXT, 0x0108),
        op(Opcode.CONTEXT, 0x0109),
        op(Opcode.CONTEXT, 0x010a),
      op(Opcode.ITIERV2_REPORT, THRESHOLDS.length)
    ]);

    // MAIN
    // The source will match expected reports for Alice & Bob and return True if both match
    // prettier-ignore
    const sourceMain = concat([
          sourceAliceReport,
          op(Opcode.CONTEXT, 0x0100), // Alice's expected report
        op(Opcode.EQUAL_TO),
          sourceBobReport,
          op(Opcode.CONTEXT, 0x0102), // Bob's expected report
        op(Opcode.EQUAL_TO),
      op(Opcode.EVERY, 2)
    ]);

    const combineTierMain = (await combineTierDeploy(deployer, {
      combinedTiersLength: 1,
      stateConfig: {
        sources: [sourceMain, sourceReportTimeForTierDefault],
        constants: [stake.address],
      },
      expressionDeployer: expressionDeployer.address,
      interpreter: interpreter.address,
    })) as CombineTier;

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
    const interpreter = await rainterpreterDeploy();
    const expressionDeployer = await rainterpreterExpressionDeployer(
      interpreter
    );

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: tokenERC20.address,
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      stateConfig: {
        sources: [
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
        ],
        constants: [max_uint256],
      },
    };

    const stake0 = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);
    const stake1 = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

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
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract stake0
        op(Opcode.CONTEXT, 0x0100), // address
        op(Opcode.CONTEXT, 0x0100), // THRESHOLDS
        op(Opcode.CONTEXT, 0x0101),
        op(Opcode.CONTEXT, 0x0102),
        op(Opcode.CONTEXT, 0x0103),
        op(Opcode.CONTEXT, 0x0104),
        op(Opcode.CONTEXT, 0x0105),
        op(Opcode.CONTEXT, 0x0106),
        op(Opcode.CONTEXT, 0x0107),
      op(Opcode.ITIERV2_REPORT, THRESHOLDS.length)
    ]);

    // prettier-ignore
    const sourceReportStake1 = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // ITierV2 contract stake1
        op(Opcode.CONTEXT, 0x0100), // address
        op(Opcode.CONTEXT, 0x0100), // THRESHOLDS
        op(Opcode.CONTEXT, 0x0101),
        op(Opcode.CONTEXT, 0x0102),
        op(Opcode.CONTEXT, 0x0103),
        op(Opcode.CONTEXT, 0x0104),
        op(Opcode.CONTEXT, 0x0105),
        op(Opcode.CONTEXT, 0x0106),
        op(Opcode.CONTEXT, 0x0107),
      op(Opcode.ITIERV2_REPORT, THRESHOLDS.length)
    ]);

    // MAIN
    // The source will check Alice's report for stake0 and stake1 contract. If valid, return stake0 report else max_uint256
    // prettier-ignore
    const sourceMain = concat([
            sourceReportStake0, // stake0 report
            op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)), // max_uint256
          op(Opcode.LESS_THAN),
            sourceReportStake1, // stake1 report
            op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)), // max_uint256
          op(Opcode.LESS_THAN),
        op(Opcode.EVERY, 2), // Condition
        sourceReportStake0, // TRUE
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)), // FALSE
      op(Opcode.EAGER_IF)
    ]);

    const combineTierMain = (await combineTierDeploy(deployer, {
      combinedTiersLength: 2,
      stateConfig: {
        sources: [sourceMain, sourceReportTimeForTierDefault],
        constants: [stake0.address, stake1.address, max_uint256],
      },
      expressionDeployer: "",
      interpreter: "",
    })) as CombineTier;

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
    const interpreter = await rainterpreterDeploy();
    const expressionDeployer = await rainterpreterExpressionDeployer(
      interpreter
    );

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: tokenERC20.address,
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      stateConfig: {
        sources: [
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
        ],
        constants: [max_uint256],
      },
    };

    const MAX_STAKE_CONTRACTS = 10;
    const POSITION_max_uint256 = 10;
    const stakeContracts = [];
    const sourceReports = [];
    const constants = [];
    for (let i = 0; i < MAX_STAKE_CONTRACTS; i++) {
      stakeContracts.push(
        await stakeDeploy(deployer, stakeFactory, stakeConfigStruct)
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
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, i)), // ITierV2 contract stake0
          op(Opcode.CONTEXT, 0x0100), // address
          op(Opcode.CONTEXT, 0x0100), // THRESHOLDS
          op(Opcode.CONTEXT, 0x0101),
          op(Opcode.CONTEXT, 0x0102),
          op(Opcode.CONTEXT, 0x0103),
          op(Opcode.CONTEXT, 0x0104),
          op(Opcode.CONTEXT, 0x0105),
          op(Opcode.CONTEXT, 0x0106),
          op(Opcode.CONTEXT, 0x0107),
        op(Opcode.ITIERV2_REPORT, THRESHOLDS.length),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, POSITION_max_uint256)), // max_uint256
        op(Opcode.LESS_THAN)
      ]);

      // Pushing source reports
      sourceReports.push(sourceReportStake);
    }

    // MAIN
    // The source will check Alice's report for stake0 and stake1 contract. If valid, return stake0 report else max_uint256
    // prettier-ignore
    const sourceMain = concat([
          ...sourceReports,
        op(Opcode.EVERY, stakeContracts.length), // Condition
        sourceReports[0], // TRUE == 1
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, POSITION_max_uint256)), // FALSE == max_uint256
      op(Opcode.EAGER_IF)
    ]);

    const combineTierMain = (await combineTierDeploy(deployer, {
      combinedTiersLength: stakeContracts.length,
      stateConfig: {
        sources: [sourceMain, sourceReportTimeForTierDefault],
        constants: [...constants, max_uint256],
      },
      expressionDeployer: "",
      interpreter: "",
    })) as CombineTier;

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

  it.only("should use ITIERV2_REPORT opcode with context data to query the report for a CombineTier contract", async () => {
    const interpreter = await rainterpreterDeploy();
    const expressionDeployer = await rainterpreterExpressionDeployer(
      interpreter
    );

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: tokenERC20.address,
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
      stateConfig: {
        sources: [
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
        ],
        constants: [max_uint256],
      },
    };

    const stake0 = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);
    const stake1 = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

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
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract stake0
        op(Opcode.CONTEXT, 0x0000), // sender
        op(Opcode.CONTEXT, 0x0200), // THRESHOLDS
        op(Opcode.CONTEXT, 0x0201),
        op(Opcode.CONTEXT, 0x0202),
        op(Opcode.CONTEXT, 0x0203),
        op(Opcode.CONTEXT, 0x0204),
        op(Opcode.CONTEXT, 0x0205),
        op(Opcode.CONTEXT, 0x0206),
        op(Opcode.CONTEXT, 0x0207),
      op(Opcode.ITIERV2_REPORT, THRESHOLDS.length)
    ]);

    // prettier-ignore
    const sourceReportStake1 = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // ITierV2 contract stake1
        op(Opcode.CONTEXT, 0x0000), // sender
        op(Opcode.CONTEXT, 0x0200), // THRESHOLDS
        op(Opcode.CONTEXT, 0x0201),
        op(Opcode.CONTEXT, 0x0202),
        op(Opcode.CONTEXT, 0x0203),
        op(Opcode.CONTEXT, 0x0204),
        op(Opcode.CONTEXT, 0x0205),
        op(Opcode.CONTEXT, 0x0206),
        op(Opcode.CONTEXT, 0x0207),
      op(Opcode.ITIERV2_REPORT, THRESHOLDS.length)
    ]);

    // MAIN
    // The source will check Alice's report for stake0 and stake1 contract. If valid, return stake0 report else max_uint256
    // prettier-ignore
    const sourceCombineTierContract = concat([
            sourceReportStake0, // stake0 report
            op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)), // max_uint256
          op(Opcode.LESS_THAN),
            sourceReportStake1, // stake1 report
            op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)), // max_uint256
          op(Opcode.LESS_THAN),
        op(Opcode.EVERY, 2), // Condition
        sourceReportStake0, // TRUE
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)), // FALSE
      op(Opcode.EAGER_IF)
    ]);

    const combineTierMain = (await combineTierDeploy(deployer, {
      combinedTiersLength: 2,
      stateConfig: {
        sources: [sourceCombineTierContract, sourceReportTimeForTierDefault],
        constants: [stake0.address, stake1.address, max_uint256],
      },
      expressionDeployer: "",
      interpreter: "",
    })) as CombineTier;

    const sourceMain = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // CombineTier contract
      op(Opcode.CONTEXT, 0x0000), // alice address
      op(Opcode.CONTEXT, 0x0001), // THRESHOLDS
      op(Opcode.CONTEXT, 0x0002),
      op(Opcode.CONTEXT, 0x0003),
      op(Opcode.CONTEXT, 0x0004),
      op(Opcode.CONTEXT, 0x0005),
      op(Opcode.CONTEXT, 0x0006),
      op(Opcode.CONTEXT, 0x0007),
      op(Opcode.CONTEXT, 0x0008),
      op(Opcode.ITIERV2_REPORT, THRESHOLDS.length),
    ]);

    const expression0 = await expressionDeployConsumer(
      {
        sources: [sourceMain],
        constants: [combineTierMain.address],
      },
      rainInterpreter
    );

    await logic.eval(rainInterpreter.address, expression0.dispatch, [
      [alice.address, ...THRESHOLDS],
    ]);

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

    await logic.eval(rainInterpreter.address, expression0.dispatch, [
      [alice.address, ...THRESHOLDS],
    ]);
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
