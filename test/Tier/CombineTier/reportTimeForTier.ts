import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  AllStandardOpsTest,
  CombineTier,
  ReadWriteTier,
  ReserveToken,
  StakeFactory,
  StandardIntegrity,
} from "../../../typechain";
import { StakeConfigStruct } from "../../../typechain/contracts/stake/Stake";
import { max_uint32, stakeDeploy, THRESHOLDS } from "../../../utils";
import { basicDeploy } from "../../../utils/deploy/basic";
import { combineTierDeploy } from "../../../utils/deploy/combineTier";
import { getBlockTimestamp, timewarp } from "../../../utils/hardhat";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
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
let logic: AllStandardOpsTest;

describe("CombineTier report time for tier tests", async function () {
  const ctxAccount = op(Opcode.CONTEXT, 0x0000);
  const CONST_REPORT_TIME_FOR_TIER = 123;

  // prettier-ignore
  // return default report
  const sourceReportDefault = concat([
      op(Opcode.THIS_ADDRESS),
      ctxAccount,
    op(Opcode.ITIERV2_REPORT),
  ]);

  beforeEach(async () => {
    signers = await ethers.getSigners();
    deployer = signers[0];
    alice = signers[1];
    bob = signers[2];

    tokenERC20 = (await basicDeploy("ReserveToken", {})) as ReserveToken;
    tokenERC20.initialize();

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    readWriteTier = (await tierFactory.deploy()) as ReadWriteTier;
    await readWriteTier.deployed();

    const stakeFactoryFactory = await ethers.getContractFactory(
      "StakeFactory",
      {}
    );
    stakeFactory = (await stakeFactoryFactory.deploy()) as StakeFactory;
    await stakeFactory.deployed();

    const integrityFactory = await ethers.getContractFactory(
      "StandardIntegrity"
    );
    const integrity = (await integrityFactory.deploy()) as StandardIntegrity;
    await integrity.deployed();
    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
    // deploy a basic interpreter contract
    logic = (await logicFactory.deploy(
      integrity.address
    )) as AllStandardOpsTest;
  });

  it("should support returning report time for tier using Interpreter script (e.g. constant timestamp value)", async () => {
    const combineTier = (await combineTierDeploy(deployer, {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
        ],
        constants: [
          numArrayToReport([10, 20, 30, 40, 50, 60, 70, 80]),
          CONST_REPORT_TIME_FOR_TIER, // just return a constant value
        ],
      },
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
      op(Opcode.STATE, memoryOperand(MemoryType.Constant,0)), // ITierV2 contract
      op(Opcode.CONTEXT, 0x0000), // SENDER
      op(Opcode.CONTEXT, 0x0001), // tier
    op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER)
    ]);

    const combineTierMain = (await combineTierDeploy(deployer, {
      combinedTiersLength: 1,
      sourceConfig: {
        sources: [sourceReportDefault, sourceMain],
        constants,
      },
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
    const vAlice = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vTokenAddr = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
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
      sourceConfig: {
        sources: [sourceReportDefault, sourceTierContractAlice],
        constants: [alice.address, tokenERC20.address],
      },
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
      sourceConfig: {
        sources: [sourceReportDefault, sourceTierContractBob],
        constants: [bob.address, tokenERC20.address],
      },
    })) as CombineTier;

    // MAIN
    const constants = [
      ethers.BigNumber.from(tierContractAlice.address),
      ethers.BigNumber.from(tierContractBob.address),
    ];

    // prettier-ignore
    const sourceMain = concat([
            op(Opcode.STATE, memoryOperand(MemoryType.Constant,0)),
            op(Opcode.CONTEXT, 0x0000),
            op(Opcode.CONTEXT, 0x0001),
          op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, 0),
        op(Opcode.ISZERO),
          op(Opcode.STATE, memoryOperand(MemoryType.Constant,1)),
          op(Opcode.CONTEXT, 0x0000),
          op(Opcode.CONTEXT, 0x0001),
        op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, 0),
          op(Opcode.STATE, memoryOperand(MemoryType.Constant,0)),
          op(Opcode.CONTEXT, 0x0000),
          op(Opcode.CONTEXT, 0x0001),
        op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, 0),
      op(Opcode.EAGER_IF)
    ]);

    const combineTierMain = (await combineTierDeploy(deployer, {
      combinedTiersLength: 2,
      sourceConfig: {
        sources: [sourceReportDefault, sourceMain],
        constants,
      },
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
        op(Opcode.STATE, memoryOperand(MemoryType.Constant,0)), // Contract address
        op(Opcode.CONTEXT, 0x0000), // account
        op(Opcode.CONTEXT, 0x0001), // tier
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER),
    ])

    // prettier-ignore
    const sourceBobReport = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant,0)), // Contract address
        op(Opcode.CONTEXT, 0x0100), // account
        op(Opcode.CONTEXT, 0x0001), // tier
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER),
    ])
    // ================================ LOGIC TEST

    // The source will check Alice's report if it is set [i.e] less than max_uint32, if true, return Alice's report else return Bob's report
    // prettier-ignore
    const sourceMain = concat([
           sourceAliceReport,
          op(Opcode.STATE, memoryOperand(MemoryType.Constant,1)), // max_uint32
        op(Opcode.LESS_THAN),  // 0
          sourceAliceReport,
          sourceBobReport,
      op(Opcode.EAGER_IF)
    ]);

    const combineTierMain = (await combineTierDeploy(deployer, {
      combinedTiersLength: 1,
      sourceConfig: {
        sources: [sourceReportDefault, sourceMain],
        constants,
      },
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
    await readWriteTier.connect(alice).setTier(alice.address, Tier.ONE);
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
    await readWriteTier.connect(bob).setTier(bob.address, Tier.ONE);
    const expectedResultBob = await getBlockTimestamp();
    await timewarp(10);
    // Set Alice's status
    await readWriteTier.connect(alice).setTier(alice.address, Tier.ONE);
    const expectedResultAlice = await getBlockTimestamp();

    // prettier-ignore
    const sourceAliceReport = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant,0)), // Alice's Report
      op(Opcode.CONTEXT, 0x0000),
      op(Opcode.CONTEXT, 0x0001),
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER),
    ])

    // prettier-ignore
    const sourceBobReport = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant,0)), // Bob's Report
        op(Opcode.CONTEXT, 0x0100),
        op(Opcode.CONTEXT, 0x0001),
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER),
    ])

    // MAIN
    const constants = [ethers.BigNumber.from(readWriteTier.address)];

    // The source will match expected reports for Alice & Bob and return True if both match
    // prettier-ignore
    const sourceMain = concat([
          sourceAliceReport,
          op(Opcode.CONTEXT, 0x0101), // Alice's expected report
        op(Opcode.EQUAL_TO),
          sourceBobReport,
          op(Opcode.CONTEXT, 0x0102), // Bob's expected report
        op(Opcode.EQUAL_TO),
      op(Opcode.EVERY, 2)
    ]);

    const combineTierMain = (await combineTierDeploy(deployer, {
      combinedTiersLength: 1,
      sourceConfig: {
        sources: [sourceReportDefault, sourceMain],
        constants,
      },
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
    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: tokenERC20.address,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and deposit them
    const depositAmount0 = THRESHOLDS[7].add(1);
    await tokenERC20.transfer(alice.address, depositAmount0);
    await tokenERC20.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);
    const expectedReportAlice = await getBlockTimestamp();

    // Give Bob reserve tokens and deposit them
    await timewarp(10000);
    const depositAmount1 = THRESHOLDS[2].add(1);
    await tokenERC20.transfer(bob.address, depositAmount1);
    await tokenERC20.connect(bob).approve(stake.address, depositAmount1);
    await stake.connect(bob).deposit(depositAmount1, bob.address);
    const expectedReportBob = await getBlockTimestamp();

    // prettier-ignore
    const sourceAliceReport = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant,0)), // ITierV2 contract
        op(Opcode.CONTEXT, 0x0000), // address
        op(Opcode.CONTEXT, 0x0001), // TIER
        op(Opcode.CONTEXT, 0x0103), // THRESHOLDS
        op(Opcode.CONTEXT, 0x0104),
        op(Opcode.CONTEXT, 0x0105),
        op(Opcode.CONTEXT, 0x0106),
        op(Opcode.CONTEXT, 0x0107),
        op(Opcode.CONTEXT, 0x0108),
        op(Opcode.CONTEXT, 0x0109),
        op(Opcode.CONTEXT, 0x010a),
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, THRESHOLDS.length)
    ]);

    // prettier-ignore
    const sourceBobReport = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant,0)), // ITierV2 contract
        op(Opcode.CONTEXT, 0x0101), // address
        op(Opcode.CONTEXT, 0x0001), // TIER
        op(Opcode.CONTEXT, 0x0103), // THRESHOLDS
        op(Opcode.CONTEXT, 0x0104),
        op(Opcode.CONTEXT, 0x0105),
        op(Opcode.CONTEXT, 0x0106),
        op(Opcode.CONTEXT, 0x0107),
        op(Opcode.CONTEXT, 0x0108),
        op(Opcode.CONTEXT, 0x0109),
        op(Opcode.CONTEXT, 0x010a),
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, THRESHOLDS.length)
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
      sourceConfig: {
        sources: [sourceReportDefault, sourceMain],
        constants: [stake.address],
      },
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
    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: tokenERC20.address,
    };

    const stake0 = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);
    const stake1 = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and deposit them to stake0
    const depositAmount0 = THRESHOLDS[7].add(1);
    await tokenERC20.transfer(alice.address, depositAmount0);
    await tokenERC20.connect(alice).approve(stake0.address, depositAmount0);
    await stake0.connect(alice).deposit(depositAmount0, alice.address);
    const expectedReportStake0 = await getBlockTimestamp();

    // prettier-ignore
    const sourceReportStake0 = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant,0)), // ITierV2 contract stake0
        op(Opcode.CONTEXT, 0x0000), // address
        op(Opcode.CONTEXT, 0x0001), // TIER
        op(Opcode.CONTEXT, 0x0100), // THRESHOLDS
        op(Opcode.CONTEXT, 0x0101),
        op(Opcode.CONTEXT, 0x0102),
        op(Opcode.CONTEXT, 0x0103),
        op(Opcode.CONTEXT, 0x0104),
        op(Opcode.CONTEXT, 0x0105),
        op(Opcode.CONTEXT, 0x0106),
        op(Opcode.CONTEXT, 0x0107),
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, THRESHOLDS.length)
    ]);

    // prettier-ignore
    const sourceReportStake1 = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant,1)), // ITierV2 contract stake1
        op(Opcode.CONTEXT, 0x0000), // address
        op(Opcode.CONTEXT, 0x0001), // TIER
        op(Opcode.CONTEXT, 0x0100), // THRESHOLDS
        op(Opcode.CONTEXT, 0x0101),
        op(Opcode.CONTEXT, 0x0102),
        op(Opcode.CONTEXT, 0x0103),
        op(Opcode.CONTEXT, 0x0104),
        op(Opcode.CONTEXT, 0x0105),
        op(Opcode.CONTEXT, 0x0106),
        op(Opcode.CONTEXT, 0x0107),
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, THRESHOLDS.length)
    ]);

    // MAIN
    // The source will check Alice's report of a TIER for stake0 and stake1 contract. If valid, return stake0 report else max_uint32
    // prettier-ignore
    const sourceMain = concat([
            sourceReportStake0, // stake0 report
            op(Opcode.STATE, memoryOperand(MemoryType.Constant,2)), // max_uint32
          op(Opcode.LESS_THAN),
            sourceReportStake1, // stake1 report
            op(Opcode.STATE, memoryOperand(MemoryType.Constant,2)), // max_uint32
          op(Opcode.LESS_THAN),
        op(Opcode.EVERY, 2), // Condition
        sourceReportStake0, // TRUE
        op(Opcode.STATE, memoryOperand(MemoryType.Constant,2)), // FALSE
      op(Opcode.EAGER_IF)
    ]);

    const combineTierMain = (await combineTierDeploy(deployer, {
      combinedTiersLength: 2,
      sourceConfig: {
        sources: [sourceReportDefault, sourceMain],
        constants: [stake0.address, stake1.address, max_uint32],
      },
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
    await tokenERC20.connect(alice).approve(stake1.address, depositAmount1);
    await stake1.connect(alice).deposit(depositAmount1, alice.address);

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
    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: tokenERC20.address,
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
          .connect(alice)
          .approve(stakeContracts[i].address, depositAmount0);
        await stakeContracts[i]
          .connect(alice)
          .deposit(depositAmount0, alice.address);
      }

      // prettier-ignore
      const sourceReportStake = concat([
          op(Opcode.STATE, memoryOperand(MemoryType.Constant,i)), // ITierV2 contract stake0
          op(Opcode.CONTEXT, 0x0000), // address
          op(Opcode.CONTEXT, 0x0001), // Tier
          op(Opcode.CONTEXT, 0x0100), // THRESHOLDS
          op(Opcode.CONTEXT, 0x0101),
          op(Opcode.CONTEXT, 0x0102),
          op(Opcode.CONTEXT, 0x0103),
          op(Opcode.CONTEXT, 0x0104),
          op(Opcode.CONTEXT, 0x0105),
          op(Opcode.CONTEXT, 0x0106),
          op(Opcode.CONTEXT, 0x0107),
        op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, THRESHOLDS.length),
        op(Opcode.STATE, memoryOperand(MemoryType.Constant,POSITION_max_uint32)), // max_uint32
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
        op(Opcode.STATE, memoryOperand(MemoryType.Constant,POSITION_max_uint32)), // FALSE == max_uint32
      op(Opcode.EAGER_IF)
    ]);

    const combineTierMain = (await combineTierDeploy(deployer, {
      combinedTiersLength: stakeContracts.length,
      sourceConfig: {
        sources: [sourceReportDefault, sourceMain],
        constants: [...constants, max_uint32],
      },
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
      .connect(alice)
      .approve(stakeContracts[MAX_STAKE_CONTRACTS - 1].address, depositAmount1);
    await stakeContracts[MAX_STAKE_CONTRACTS - 1]
      .connect(alice)
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

  it("should use ITIERV2_REPORT opcode with context data to query the report for a CombineTier contract", async () => {
    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: tokenERC20.address,
    };

    const stake0 = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);
    const stake1 = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and deposit them to stake0
    const depositAmount0 = THRESHOLDS[7].add(1);
    await tokenERC20.transfer(alice.address, depositAmount0);
    await tokenERC20.connect(alice).approve(stake0.address, depositAmount0);
    await stake0.connect(alice).deposit(depositAmount0, alice.address);
    const expectedReportStake0 = await getBlockTimestamp();

    // prettier-ignore
    const sourceReportStake0 = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant,0)), // ITierV2 contract stake0
        op(Opcode.CONTEXT, 0x0000), // address
        op(Opcode.CONTEXT, 0x0001), // TIER
        op(Opcode.CONTEXT, 0x0100), // THRESHOLDS
        op(Opcode.CONTEXT, 0x0101),
        op(Opcode.CONTEXT, 0x0102),
        op(Opcode.CONTEXT, 0x0103),
        op(Opcode.CONTEXT, 0x0104),
        op(Opcode.CONTEXT, 0x0105),
        op(Opcode.CONTEXT, 0x0106),
        op(Opcode.CONTEXT, 0x0107),
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, THRESHOLDS.length)
    ]);

    // prettier-ignore
    const sourceReportStake1 = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant,1)), // ITierV2 contract stake1
        op(Opcode.CONTEXT, 0x0000), // address
        op(Opcode.CONTEXT, 0x0001), // TIER
        op(Opcode.CONTEXT, 0x0100), // THRESHOLDS
        op(Opcode.CONTEXT, 0x0101),
        op(Opcode.CONTEXT, 0x0102),
        op(Opcode.CONTEXT, 0x0103),
        op(Opcode.CONTEXT, 0x0104),
        op(Opcode.CONTEXT, 0x0105),
        op(Opcode.CONTEXT, 0x0106),
        op(Opcode.CONTEXT, 0x0107),
      op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, THRESHOLDS.length)
    ]);

    // MAIN
    // The source will check Alice's report of a TIER for stake0 and stake1 contract. If valid, return stake0 report else max_uint32
    // prettier-ignore
    const sourceCombineTierContract = concat([
            sourceReportStake0, // stake0 report
            op(Opcode.STATE, memoryOperand(MemoryType.Constant,2)), // max_uint32
          op(Opcode.LESS_THAN),
            sourceReportStake1, // stake1 report
            op(Opcode.STATE, memoryOperand(MemoryType.Constant,2)), // max_uint32
          op(Opcode.LESS_THAN),
        op(Opcode.EVERY, 2), // Condition
        sourceReportStake0, // TRUE
        op(Opcode.STATE, memoryOperand(MemoryType.Constant,2)), // FALSE
      op(Opcode.EAGER_IF)
    ]);

    const combineTierMain = (await combineTierDeploy(deployer, {
      combinedTiersLength: 2,
      sourceConfig: {
        sources: [sourceReportDefault, sourceCombineTierContract],
        constants: [stake0.address, stake1.address, max_uint32],
      },
    })) as CombineTier;

    const sourceMain = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)), // CombineTier contract
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

    await logic.initialize({
      sources: [sourceMain],
      constants: [combineTierMain.address],
    });

    await logic
      .connect(alice)
      .runContext([[alice.address, Tier.ONE, ...THRESHOLDS]]);

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
    await tokenERC20.connect(alice).approve(stake1.address, depositAmount1);
    await stake1.connect(alice).deposit(depositAmount1, alice.address);

    await logic
      .connect(alice)
      .runContext([[alice.address, Tier.ONE, ...THRESHOLDS]]);
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
