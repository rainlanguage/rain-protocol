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
  max_uint256,
  max_uint32,
  readWriteTierDeploy,
  stakeDeploy,
  THRESHOLDS,
} from "../../../utils";
import { rainterpreterDeploy } from "../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { stakeFactoryDeploy } from "../../../utils/deploy/stake/stakeFactory/deploy";
import { expressionConsumerDeploy } from "../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { reserveDeploy } from "../../../utils/deploy/test/reserve/deploy";
import { combineTierDeploy } from "../../../utils/deploy/tier/combineTier/deploy";
import { getBlockTimestamp, timewarp } from "../../../utils/hardhat";
import {
  generateEvaluableConfig,
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import { numArrayToReport } from "../../../utils/tier";
import { Tier } from "../../../utils/types/tier";

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

describe("CombineTier report time for tier tests", async function () {
  const ctxAccount = op(Opcode.CONTEXT, 0x0000);
  const CONST_REPORT_TIME_FOR_TIER = 123;

  // prettier-ignore
  // return default report
  const sourceReportDefault = concat([
      op(Opcode.CONTEXT, 0x0001),
      ctxAccount,
    op(Opcode.ITIERV2_REPORT),
  ]);

  beforeEach(async () => {
    signers = await ethers.getSigners();
    deployer = signers[0];
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

  it("should support returning report time for tier using Interpreter script (e.g. constant timestamp value)", async () => {
    const evaluableConfig = await generateEvaluableConfig({
      sources: [
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
      ],
      constants: [
        numArrayToReport([10, 20, 30, 40, 50, 60, 70, 80]),
        CONST_REPORT_TIME_FOR_TIER, // just return a constant value
      ],
    });

    const combineTier = (await combineTierDeploy(deployer, {
      combinedTiersLength: 0,
      evaluableConfig: evaluableConfig,
    })) as CombineTier;

    const timeForTier = await combineTier.reportTimeForTier(
      signers[1].address,
      Tier.FIVE, // doesn't matter what tier as we return a constant
      []
    );

    assert(
      timeForTier.eq(CONST_REPORT_TIME_FOR_TIER),
      `wrong timestamp
      expected  ${CONST_REPORT_TIME_FOR_TIER}
      got       ${timeForTier}`
    );
  });

  it("should query the report from a single ReadWriteTier contract", async () => {
    // Set Alice's status
    await readWriteTier.setTier(alice.address, Tier.ONE);
    const expectedTier1Timestamp = await getBlockTimestamp();

    // MAIN
    const constants = [readWriteTier.address];

    // prettier-ignore
    const sourceMain = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant,0)), // ITierV2 contract
        op(Opcode.CONTEXT, 0x0100), // alice address
        op(Opcode.CONTEXT, 0x0101), // tier
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER)
    ]);
    const evaluableConfig = await generateEvaluableConfig({
      sources: [sourceReportDefault, sourceMain],
      constants,
    });
    const combineTierMain = (await combineTierDeploy(deployer, {
      combinedTiersLength: 1,
      evaluableConfig,
    })) as CombineTier;

    const result0 = await combineTierMain.reportTimeForTier(
      alice.address,
      Tier.ONE,
      []
    );

    const expected0 = expectedTier1Timestamp;

    assert(
      result0.eq(expected0),
      `wrong report
      expected  ${expected0}
      got       ${result0}`
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
    const evaluableConfigAlice = await generateEvaluableConfig({
      sources: [sourceReportDefault, sourceTierContractAlice],
      constants: [alice.address, tokenERC20.address],
    });
    const tierContractAlice = (await combineTierDeploy(deployer, {
      combinedTiersLength: 0,
      evaluableConfig: evaluableConfigAlice,
    })) as CombineTier;

    // BOB
    // prettier-ignore
    const sourceTierContractBob = concat([
        vTokenAddr,
        vAlice,
      op(Opcode.ERC20_BALANCE_OF),
    ]);

    const evaluableConfigBob = await generateEvaluableConfig({
      sources: [sourceReportDefault, sourceTierContractBob],
      constants: [bob.address, tokenERC20.address],
    });

    const tierContractBob = (await combineTierDeploy(deployer, {
      combinedTiersLength: 0,
      evaluableConfig: evaluableConfigBob,
    })) as CombineTier;

    // MAIN
    const constants = [
      ethers.BigNumber.from(tierContractAlice.address),
      ethers.BigNumber.from(tierContractBob.address),
    ];

    // prettier-ignore
    const sourceMain = concat([
            op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant,0)),
            op(Opcode.CONTEXT, 0x0000),
            op(Opcode.CONTEXT, 0x0001),
          op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, 0),
        op(Opcode.ISZERO),
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant,1)),
          op(Opcode.CONTEXT, 0x0000),
          op(Opcode.CONTEXT, 0x0001),
        op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, 0),
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant,0)),
          op(Opcode.CONTEXT, 0x0000),
          op(Opcode.CONTEXT, 0x0001),
        op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, 0),
      op(Opcode.EAGER_IF)
    ]);
    const evaluableConfig = await generateEvaluableConfig({
      sources: [sourceReportDefault, sourceMain],
      constants,
    });
    const combineTierMain = (await combineTierDeploy(deployer, {
      combinedTiersLength: 2,
      evaluableConfig: evaluableConfig,
    })) as CombineTier;

    const result0 = await combineTierMain.reportTimeForTier(
      signers[1].address,
      Tier.ZERO,
      []
    );

    const expected0 = 11;

    assert(
      result0.eq(expected0),
      `wrong report
      expected  ${expected0}
      got       ${result0}`
    );

    // Transferring tokens to Alice
    tokenERC20.transfer(alice.address, 1);
    const result1 = await combineTierMain.reportTimeForTier(
      signers[1].address,
      Tier.ZERO,
      []
    );

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
    await readWriteTier.setTier(bob.address, Tier.ONE);
    const expectedResultBob = await getBlockTimestamp();

    // MAIN
    const constants = [
      ethers.BigNumber.from(readWriteTier.address),
      max_uint32,
    ];

    // prettier-ignore
    const sourceAliceReport = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant,0)), // Contract address
        op(Opcode.CONTEXT, 0x0100), // alice address
        op(Opcode.CONTEXT, 0x0101), // tier
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER),
    ])

    // prettier-ignore
    const sourceBobReport = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant,0)), // Contract address
        op(Opcode.CONTEXT, 0x0200), // bob address
        op(Opcode.CONTEXT, 0x0101), // tier
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER),
    ])
    // ================================ LOGIC TEST

    // The source will check Alice's report if it is set [i.e] less than max_uint32, if true, return Alice's report else return Bob's report
    // prettier-ignore
    const sourceMain = concat([
           sourceAliceReport,
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant,1)), // max_uint32
        op(Opcode.LESS_THAN),  // 0
          sourceAliceReport,
          sourceBobReport,
      op(Opcode.EAGER_IF)
    ]);
    const evaluableConfig = await generateEvaluableConfig({
      sources: [sourceReportDefault, sourceMain],
      constants,
    });
    const combineTierMain = (await combineTierDeploy(deployer, {
      combinedTiersLength: 1,
      evaluableConfig,
    })) as CombineTier;

    const result0 = await combineTierMain.reportTimeForTier(
      alice.address,
      Tier.ONE,
      [bob.address]
    );

    assert(
      result0.eq(expectedResultBob),
      `wrong report
      expected  ${expectedResultBob}
      got       ${result0}`
    );

    // Set Alice's status
    await timewarp(10);
    await readWriteTier.connect(alice.address).setTier(alice.address, Tier.ONE);
    const expectedResultAlice = await getBlockTimestamp();

    const result1 = await combineTierMain.reportTimeForTier(
      alice.address,
      Tier.ONE,
      [bob.address]
    );

    assert(
      result1.eq(expectedResultAlice),
      `wrong report
      expected  ${expectedResultAlice}
      got       ${result1}`
    );
  });

  it("should use context to pass extra data to the CombineTier script", async () => {
    // Set Bob's status
    await readWriteTier.connect(bob.address).setTier(bob.address, Tier.ONE);
    const expectedResultBob = await getBlockTimestamp();
    await timewarp(10);
    // Set Alice's status
    await readWriteTier.connect(alice.address).setTier(alice.address, Tier.ONE);
    const expectedResultAlice = await getBlockTimestamp();

    // prettier-ignore
    const sourceAliceReport = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant,0)), // Alice's Report
      op(Opcode.CONTEXT, 0x0100), // alice address
      op(Opcode.CONTEXT, 0x0101), // TIER
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER),
    ])

    // prettier-ignore
    const sourceBobReport = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant,0)), // Bob's Report
        op(Opcode.CONTEXT, 0x0200), // bob address
        op(Opcode.CONTEXT, 0x0101), // TIER
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER),
    ])

    // MAIN
    const constants = [ethers.BigNumber.from(readWriteTier.address)];

    // The source will match expected reports for Alice & Bob and return True if both match
    // prettier-ignore
    const sourceMain = concat([
          sourceAliceReport,
          op(Opcode.CONTEXT, 0x0201), // Alice's expected report
        op(Opcode.EQUAL_TO),
          sourceBobReport,
          op(Opcode.CONTEXT, 0x0202), // Bob's expected report
        op(Opcode.EQUAL_TO),
      op(Opcode.EVERY, 2)
    ]);
    const evaluableConfig = await generateEvaluableConfig({
      sources: [sourceReportDefault, sourceMain],
      constants,
    });
    const combineTierMain = (await combineTierDeploy(deployer, {
      combinedTiersLength: 1,
      evaluableConfig,
    })) as CombineTier;

    const result0 = await combineTierMain.reportTimeForTier(
      alice.address,
      Tier.ONE,
      [bob.address, expectedResultAlice, expectedResultBob]
    );

    const expectedResult0 = 1;
    assert(
      result0.eq(expectedResult0),
      `wrong report
      expected  ${expectedResult0}
      got       ${result0}`
    );

    // Switching the expected results
    const result1 = await combineTierMain.reportTimeForTier(
      alice.address,
      Tier.ONE,
      [bob.address, expectedResultBob, expectedResultAlice]
    );

    const expectedResult1 = 0;
    assert(
      result1.eq(expectedResult1),
      `wrong report
      expected  ${expectedResult1}
      got       ${result1}`
    );
  });

  it("should query Stake Contract's report for a Tier using Combine Tier", async () => {
    const evaluableConfigStake = await generateEvaluableConfig(
      {
        sources: [
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
        ],
        constants: [max_uint256],
      },
      false
    );
    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: tokenERC20.address,
      evaluableConfig: evaluableConfigStake,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and deposit them
    const depositAmount0 = THRESHOLDS[7].add(1);
    await tokenERC20.transfer(alice.address, depositAmount0);
    await tokenERC20
      .connect(alice.address)
      .approve(stake.address, depositAmount0);
    await stake.connect(alice.address).deposit(depositAmount0, alice.address);
    const expectedReportAlice = await getBlockTimestamp();

    // Give Bob reserve tokens and deposit them
    await timewarp(10000);
    const depositAmount1 = THRESHOLDS[2].add(1);
    await tokenERC20.transfer(bob.address, depositAmount1);
    await tokenERC20
      .connect(bob.address)
      .approve(stake.address, depositAmount1);
    await stake.connect(bob.address).deposit(depositAmount1, bob.address);
    const expectedReportBob = await getBlockTimestamp();

    // prettier-ignore
    const sourceAliceReport = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant,0)), // ITierV2 contract
        op(Opcode.CONTEXT, 0x0100), // alice address
        op(Opcode.CONTEXT, 0x0101), // TIER
        op(Opcode.CONTEXT, 0x0203), // THRESHOLDS
        op(Opcode.CONTEXT, 0x0204),
        op(Opcode.CONTEXT, 0x0205),
        op(Opcode.CONTEXT, 0x0206),
        op(Opcode.CONTEXT, 0x0207),
        op(Opcode.CONTEXT, 0x0208),
        op(Opcode.CONTEXT, 0x0209),
        op(Opcode.CONTEXT, 0x020a),
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, THRESHOLDS.length)
    ]);

    // prettier-ignore
    const sourceBobReport = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant,0)), // ITierV2 contract
        op(Opcode.CONTEXT, 0x0201), // bob address
        op(Opcode.CONTEXT, 0x0101), // TIER
        op(Opcode.CONTEXT, 0x0203), // THRESHOLDS
        op(Opcode.CONTEXT, 0x0204),
        op(Opcode.CONTEXT, 0x0205),
        op(Opcode.CONTEXT, 0x0206),
        op(Opcode.CONTEXT, 0x0207),
        op(Opcode.CONTEXT, 0x0208),
        op(Opcode.CONTEXT, 0x0209),
        op(Opcode.CONTEXT, 0x020a),
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, THRESHOLDS.length)
    ]);

    // MAIN
    // The source will match expected reports for Alice & Bob and return True if both match
    // prettier-ignore
    const sourceMain = concat([
          sourceAliceReport,
          op(Opcode.CONTEXT, 0x0200), // Alice's expected report
        op(Opcode.EQUAL_TO),
          sourceBobReport,
          op(Opcode.CONTEXT, 0x0202), // Bob's expected report
        op(Opcode.EQUAL_TO),
      op(Opcode.EVERY, 2)
    ]);
    const evaluableConfigCombineTier = await generateEvaluableConfig({
      sources: [sourceReportDefault, sourceMain],
      constants: [stake.address],
    });
    const combineTierMain = (await combineTierDeploy(deployer, {
      combinedTiersLength: 1,
      evaluableConfig: evaluableConfigCombineTier,
    })) as CombineTier;

    const result0 = await combineTierMain.reportTimeForTier(
      alice.address,
      Tier.ONE,
      [expectedReportAlice, bob.address, expectedReportBob, ...THRESHOLDS]
    );

    const expectedResult0 = 1;
    assert(
      result0.eq(expectedResult0),
      `wrong report
      expected  ${expectedResult0}
      got       ${result0}`
    );
  });

  it("should combine reports of 2 staking contracts", async () => {
    const evaluableConfigStake = await generateEvaluableConfig(
      {
        sources: [
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
        ],
        constants: [max_uint256],
      },
      false
    );
    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: tokenERC20.address,
      evaluableConfig: evaluableConfigStake,
    };

    const stake0 = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);
    const stake1 = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and deposit them to stake0
    const depositAmount0 = THRESHOLDS[7].add(1);
    await tokenERC20.transfer(alice.address, depositAmount0);
    await tokenERC20
      .connect(alice.address)
      .approve(stake0.address, depositAmount0);
    await stake0.connect(alice.address).deposit(depositAmount0, alice.address);
    const expectedReportStake0 = await getBlockTimestamp();

    // prettier-ignore
    const sourceReportStake0 = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant,0)), // ITierV2 contract stake0
        op(Opcode.CONTEXT, 0x0100), // address
        op(Opcode.CONTEXT, 0x0101), // TIER
        op(Opcode.CONTEXT, 0x0200), // THRESHOLDS
        op(Opcode.CONTEXT, 0x0201),
        op(Opcode.CONTEXT, 0x0202),
        op(Opcode.CONTEXT, 0x0203),
        op(Opcode.CONTEXT, 0x0204),
        op(Opcode.CONTEXT, 0x0205),
        op(Opcode.CONTEXT, 0x0206),
        op(Opcode.CONTEXT, 0x0207),
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, THRESHOLDS.length)
    ]);

    // prettier-ignore
    const sourceReportStake1 = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant,1)), // ITierV2 contract stake1
        op(Opcode.CONTEXT, 0x0100), // address
        op(Opcode.CONTEXT, 0x0101), // TIER
        op(Opcode.CONTEXT, 0x0200), // THRESHOLDS
        op(Opcode.CONTEXT, 0x0201),
        op(Opcode.CONTEXT, 0x0202),
        op(Opcode.CONTEXT, 0x0203),
        op(Opcode.CONTEXT, 0x0204),
        op(Opcode.CONTEXT, 0x0205),
        op(Opcode.CONTEXT, 0x0206),
        op(Opcode.CONTEXT, 0x0207),
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, THRESHOLDS.length)
    ]);

    // MAIN
    // The source will check Alice's report of a TIER for stake0 and stake1 contract. If valid, return stake0 report else max_uint32
    // prettier-ignore
    const sourceMain = concat([
            sourceReportStake0, // stake0 report
            op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant,2)), // max_uint32
          op(Opcode.LESS_THAN),
            sourceReportStake1, // stake1 report
            op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant,2)), // max_uint32
          op(Opcode.LESS_THAN),
        op(Opcode.EVERY, 2), // Condition
        sourceReportStake0, // TRUE
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant,2)), // FALSE
      op(Opcode.EAGER_IF)
    ]);
    const evaluableConfigCombineTier = await generateEvaluableConfig(
      {
        sources: [sourceReportDefault, sourceMain],
        constants: [stake0.address, stake1.address, max_uint32],
      },
      false
    );
    const combineTierMain = (await combineTierDeploy(deployer, {
      combinedTiersLength: 2,
      evaluableConfig: evaluableConfigCombineTier,
    })) as CombineTier;

    const result0 = await combineTierMain.reportTimeForTier(
      alice.address,
      Tier.ONE,
      [...THRESHOLDS]
    );

    const expectedResult0 = max_uint32;
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
    await tokenERC20
      .connect(alice.address)
      .approve(stake1.address, depositAmount1);
    await stake1.connect(alice.address).deposit(depositAmount1, alice.address);

    const result1 = await combineTierMain.reportTimeForTier(
      alice.address,
      Tier.ONE,
      [...THRESHOLDS]
    );

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
      {
        sources: [
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
        ],
        constants: [max_uint256],
      },
      false
    );

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: tokenERC20.address,
      evaluableConfig: evaluableConfigStake,
    };

    const MAX_STAKE_CONTRACTS = 10;
    const POSITION_max_uint32 = 10;
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
          .connect(alice.address)
          .approve(stakeContracts[i].address, depositAmount0);
        await stakeContracts[i]
          .connect(alice.address)
          .deposit(depositAmount0, alice.address);
      }

      // prettier-ignore
      const sourceReportStake = concat([
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant,i)), // ITierV2 contract stake0
          op(Opcode.CONTEXT, 0x0100), // address
          op(Opcode.CONTEXT, 0x0101), // TIER
          op(Opcode.CONTEXT, 0x0200), // THRESHOLDS
          op(Opcode.CONTEXT, 0x0201),
          op(Opcode.CONTEXT, 0x0202),
          op(Opcode.CONTEXT, 0x0203),
          op(Opcode.CONTEXT, 0x0204),
          op(Opcode.CONTEXT, 0x0205),
          op(Opcode.CONTEXT, 0x0206),
          op(Opcode.CONTEXT, 0x0207),
        op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, THRESHOLDS.length),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant,POSITION_max_uint32)), // max_uint32
        op(Opcode.LESS_THAN)
      ]);

      // Pushing source reports
      sourceReports.push(sourceReportStake);
    }

    // MAIN
    // The source will check Alice's report of a Tier for stake0 and stake1 contract. If valid, return stake0 report else max_uint32
    // prettier-ignore
    const sourceMain = concat([
          ...sourceReports,
        op(Opcode.EVERY, stakeContracts.length), // Condition
        sourceReports[0], // TRUE == 1
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant,POSITION_max_uint32)), // FALSE == max_uint32
      op(Opcode.EAGER_IF)
    ]);
    const evaluableConfigCombineTier = await generateEvaluableConfig({
      sources: [sourceReportDefault, sourceMain],
      constants: [...constants, max_uint32],
    });
    const combineTierMain = (await combineTierDeploy(deployer, {
      combinedTiersLength: stakeContracts.length,
      evaluableConfig: evaluableConfigCombineTier,
    })) as CombineTier;

    const result0 = await combineTierMain.reportTimeForTier(
      alice.address,
      Tier.ONE,
      [...THRESHOLDS]
    );

    const expectedResult0 = max_uint32;
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
      .connect(alice.address)
      .approve(stakeContracts[MAX_STAKE_CONTRACTS - 1].address, depositAmount1);
    await stakeContracts[MAX_STAKE_CONTRACTS - 1]
      .connect(alice.address)
      .deposit(depositAmount1, alice.address);

    const result1 = await combineTierMain.reportTimeForTier(
      alice.address,
      Tier.ONE,
      [...THRESHOLDS]
    );

    const expectedResult1 = 1;
    assert(
      result1.eq(expectedResult1),
      `wrong report
      expected  ${expectedResult1}
      got       ${result1}`
    );
  });

  it("should use ITIERV2_REPORT opcode with context data to query the report time for tier for a CombineTier contract", async () => {
    const evaluableConfigStake = await generateEvaluableConfig(
      {
        sources: [
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
        ],
        constants: [max_uint256],
      },
      false
    );
    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: tokenERC20.address,
      evaluableConfig: evaluableConfigStake,
    };

    const stake0 = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);
    const stake1 = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and deposit them to stake0
    const depositAmount0 = THRESHOLDS[7].add(1);
    await tokenERC20.transfer(alice.address, depositAmount0);
    await tokenERC20
      .connect(alice.address)
      .approve(stake0.address, depositAmount0);
    await stake0.connect(alice.address).deposit(depositAmount0, alice.address);
    const expectedReportStake0 = await getBlockTimestamp();

    // prettier-ignore
    const sourceReportStake0 = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant,0)), // ITierV2 contract stake0
        op(Opcode.CONTEXT, 0x0100), // address
        op(Opcode.CONTEXT, 0x0101), // TIER
        op(Opcode.CONTEXT, 0x0200), // THRESHOLDS
        op(Opcode.CONTEXT, 0x0201),
        op(Opcode.CONTEXT, 0x0202),
        op(Opcode.CONTEXT, 0x0203),
        op(Opcode.CONTEXT, 0x0204),
        op(Opcode.CONTEXT, 0x0205),
        op(Opcode.CONTEXT, 0x0206),
        op(Opcode.CONTEXT, 0x0207),
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, THRESHOLDS.length)
    ]);

    // prettier-ignore
    const sourceReportStake1 = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant,1)), // ITierV2 contract stake1
        op(Opcode.CONTEXT, 0x0100), // address
        op(Opcode.CONTEXT, 0x0101), // TIER
        op(Opcode.CONTEXT, 0x0200), // THRESHOLDS
        op(Opcode.CONTEXT, 0x0201),
        op(Opcode.CONTEXT, 0x0202),
        op(Opcode.CONTEXT, 0x0203),
        op(Opcode.CONTEXT, 0x0204),
        op(Opcode.CONTEXT, 0x0205),
        op(Opcode.CONTEXT, 0x0206),
        op(Opcode.CONTEXT, 0x0207),
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, THRESHOLDS.length)
    ]);

    // MAIN
    // The source will check Alice's report of a TIER for stake0 and stake1 contract. If valid, return stake0 report else max_uint32
    // prettier-ignore
    const sourceCombineTierContract = concat([
            sourceReportStake0, // stake0 report
            op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant,2)), // max_uint32
          op(Opcode.LESS_THAN),
            sourceReportStake1, // stake1 report
            op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant,2)), // max_uint32
          op(Opcode.LESS_THAN),
        op(Opcode.EVERY, 2), // Condition
        sourceReportStake0, // TRUE
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant,2)), // FALSE
      op(Opcode.EAGER_IF)
    ]);
    const evaluableConfigCombineTier = await generateEvaluableConfig(
      {
        sources: [sourceReportDefault, sourceCombineTierContract],
        constants: [stake0.address, stake1.address, max_uint32],
      },
      false
    );
    const combineTierMain = (await combineTierDeploy(deployer, {
      combinedTiersLength: 2,
      evaluableConfig: evaluableConfigCombineTier,
    })) as CombineTier;

    const sourceMain = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // CombineTier contract
      op(Opcode.CONTEXT, 0x0000), // address
      op(Opcode.CONTEXT, 0x0001), // TIER
      op(Opcode.CONTEXT, 0x0002), // THRESHOLDS
      op(Opcode.CONTEXT, 0x0003),
      op(Opcode.CONTEXT, 0x0004),
      op(Opcode.CONTEXT, 0x0005),
      op(Opcode.CONTEXT, 0x0006),
      op(Opcode.CONTEXT, 0x0007),
      op(Opcode.CONTEXT, 0x0008),
      op(Opcode.CONTEXT, 0x0009),
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, THRESHOLDS.length),
    ]);

    const expression0 = await expressionConsumerDeploy(
      {
        sources: [sourceMain],
        constants: [combineTierMain.address],
      },
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      [[alice.address, Tier.ONE, ...THRESHOLDS]]
    );

    const result0 = await logic.stackTop();

    const expectedResult0 = max_uint32;
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
    await tokenERC20
      .connect(alice.address)
      .approve(stake1.address, depositAmount1);
    await stake1.connect(alice.address).deposit(depositAmount1, alice.address);

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      [[alice.address, Tier.ONE, ...THRESHOLDS]]
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
