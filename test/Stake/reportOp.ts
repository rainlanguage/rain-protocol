import { assert } from "chai";
import { concat, hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  AllStandardOpsTest,
  Rainterpreter,
  RainterpreterExpressionDeployer,
  ReserveToken18,
  StakeFactory,
} from "../../typechain";
import { StakeConfigStruct } from "../../typechain/contracts/stake/Stake";
import { max_uint256, sixZeros } from "../../utils/constants/bigNumber";
import { THRESHOLDS } from "../../utils/constants/stake";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import { rainterpreterDeploy } from "../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployer } from "../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import { stakeDeploy } from "../../utils/deploy/stake/deploy";
import { stakeFactoryDeploy } from "../../utils/deploy/stake/stakeFactory/deploy";
import { allStandardOpsDeploy } from "../../utils/deploy/test/allStandardOps/deploy";
import { getBlockTimestamp, timewarp } from "../../utils/hardhat";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../utils/interpreter/interpreter";
import { Opcode } from "../../utils/interpreter/ops/allStandardOps";
import { numArrayToReport } from "../../utils/tier";

describe("Stake ITIERV2_REPORT Op", async function () {
  let stakeFactory: StakeFactory;
  let token: ReserveToken18;
  let logic: AllStandardOpsTest;
  let interpreter: Rainterpreter;
  let expressionDeployer: RainterpreterExpressionDeployer;

  // Passing context data in constants
  // prettier-ignore
  const source = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract
      op(Opcode.CALLER), // address
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // context
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)),
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)),
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 4)),
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 5)),
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 6)),
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 7)),
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 8)),
    op(Opcode.ITIERV2_REPORT, THRESHOLDS.length)
  ]);

  before(async () => {
    stakeFactory = await stakeFactoryDeploy();
    logic = await allStandardOpsDeploy();
    interpreter = await rainterpreterDeploy();
    expressionDeployer = await rainterpreterExpressionDeployer(interpreter);
  });

  beforeEach(async () => {
    token = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await token.initialize();
  });

  it("should return a correct report using ITIERV2_REPORT when no token has been staked", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeStateConfigConstants = [max_uint256, max_uint256]; // setting deposits and withdrawals to max

    const max_deposit = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );

    const stakeStateConfigSources = [max_deposit, max_withdraw];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      expressionDeployer: expressionDeployer.address,
      interpreter: interpreter.address,
      stateConfig: {
        sources: stakeStateConfigSources,
        constants: stakeStateConfigConstants,
      },
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // prettier-ignore
    const source0 = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract
        op(Opcode.CALLER), // address
      op(Opcode.ITIERV2_REPORT)
    ]);

    await logic.initialize(
      {
        sources: [source0],
        constants: [stake.address],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const result = await logic.stackTop();

    assert(result.eq(max_uint256), "did not return a NEVER report");
  });

  it("should return a correct report using ITIERV2_REPORT when some tokens have been staked but do not exceed the first threshold", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeStateConfigConstants = [max_uint256, max_uint256]; // setting deposits and withdrawals to max

    const max_deposit = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );

    const stakeStateConfigSources = [max_deposit, max_withdraw];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      expressionDeployer: expressionDeployer.address,
      interpreter: interpreter.address,
      stateConfig: {
        sources: stakeStateConfigSources,
        constants: stakeStateConfigConstants,
      },
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and desposit them
    const depositAmount0 = THRESHOLDS[0].div(2);
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);

    await logic.initialize(
      {
        sources: [source],
        constants: [stake.address, ...THRESHOLDS],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const expected = max_uint256;

    const result = await logic.stackTop();

    assert(
      result.eq(expected),
      `did not return correct stake result
      expected  ${hexlify(expected)}
      got       ${hexlify(result)}`
    );
  });

  it("should return a correct report using ITIERV2_REPORT when enough tokens have been staked to exceed the 1st threshold", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeStateConfigConstants = [max_uint256, max_uint256]; // setting deposits and withdrawals to max

    const max_deposit = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );

    const stakeStateConfigSources = [max_deposit, max_withdraw];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      expressionDeployer: expressionDeployer.address,
      interpreter: interpreter.address,
      stateConfig: {
        sources: stakeStateConfigSources,
        constants: stakeStateConfigConstants,
      },
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and desposit them
    const depositAmount0 = THRESHOLDS[0].add(1);
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);

    const depositTimestamp = await getBlockTimestamp();

    await logic.initialize(
      {
        sources: [source],
        constants: [stake.address, ...THRESHOLDS],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const result = await logic.stackTop();

    const expected = numArrayToReport([
      depositTimestamp,
      0xffffffff,
      0xffffffff,
      0xffffffff,
      0xffffffff,
      0xffffffff,
      0xffffffff,
      0xffffffff,
    ]);

    assert(
      result.eq(expected),
      `did not return correct stake result
      expected  ${hexlify(expected)}
      got       ${hexlify(result)}`
    );
  });

  it("should return a correct report using ITIERV2_REPORT when enough tokens have been staked to exceed the 2nd threshold then the 4th threshold", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeStateConfigConstants = [max_uint256, max_uint256]; // setting deposits and withdrawals to max

    const max_deposit = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );

    const stakeStateConfigSources = [max_deposit, max_withdraw];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      expressionDeployer: expressionDeployer.address,
      interpreter: interpreter.address,
      stateConfig: {
        sources: stakeStateConfigSources,
        constants: stakeStateConfigConstants,
      },
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and desposit them
    const depositAmount0 = THRESHOLDS[1].add(1);
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);

    const depositTimestamp0 = await getBlockTimestamp();

    await logic.initialize(
      {
        sources: [source],
        constants: [stake.address, ...THRESHOLDS],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();
    const result0 = await logic.stackTop();

    const expected0 = numArrayToReport([
      depositTimestamp0,
      depositTimestamp0,
      0xffffffff,
      0xffffffff,
      0xffffffff,
      0xffffffff,
      0xffffffff,
      0xffffffff,
    ]);

    assert(
      result0.eq(expected0),
      `did not return correct stake report0
      expected  ${hexlify(expected0)}
      got       ${hexlify(result0)}`
    );

    // Give Alice reserve tokens and desposit them
    const depositAmount1 = THRESHOLDS[3].sub(depositAmount0);
    await token.transfer(alice.address, depositAmount1);
    await token.connect(alice).approve(stake.address, depositAmount1);
    await stake.connect(alice).deposit(depositAmount1, alice.address);

    const depositTimestamp1 = await getBlockTimestamp();

    await logic.initialize(
      {
        sources: [source],
        constants: [stake.address, ...THRESHOLDS],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();
    const result1 = await logic.stackTop();

    const expected1 = numArrayToReport([
      depositTimestamp0,
      depositTimestamp0,
      depositTimestamp1,
      depositTimestamp1,
      0xffffffff,
      0xffffffff,
      0xffffffff,
      0xffffffff,
    ]);

    assert(
      result1.eq(expected1),
      `did not return correct stake result1
      expected  ${hexlify(expected1)}
      got       ${hexlify(result1)}`
    );
  });

  it("should return a correct report using ITIERV2_REPORT when enough tokens have been staked to exceed all thresholds", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeStateConfigConstants = [max_uint256, max_uint256]; // setting deposits and withdrawals to max

    const max_deposit = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );

    const stakeStateConfigSources = [max_deposit, max_withdraw];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      expressionDeployer: expressionDeployer.address,
      interpreter: interpreter.address,
      stateConfig: {
        sources: stakeStateConfigSources,
        constants: stakeStateConfigConstants,
      },
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and desposit them
    const depositAmount0 = THRESHOLDS[7].add(1);
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);

    const depositTimestamp = await getBlockTimestamp();

    await logic.initialize(
      {
        sources: [source],
        constants: [stake.address, ...THRESHOLDS],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const result = await logic.stackTop();

    const expected = numArrayToReport([
      depositTimestamp,
      depositTimestamp,
      depositTimestamp,
      depositTimestamp,
      depositTimestamp,
      depositTimestamp,
      depositTimestamp,
      depositTimestamp,
    ]);

    assert(
      result.eq(expected),
      `did not return correct stake report
      expected  ${hexlify(expected)}
      got       ${hexlify(result)}`
    );
  });

  it("should return a correct report using ITIERV2_REPORT when staked tokens exceeded all thresholds until some were withdrawn, and then deposited again to exceed all thresholds", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeStateConfigConstants = [max_uint256, max_uint256]; // setting deposits and withdrawals to max

    const max_deposit = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );

    const stakeStateConfigSources = [max_deposit, max_withdraw];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      expressionDeployer: expressionDeployer.address,
      interpreter: interpreter.address,
      stateConfig: {
        sources: stakeStateConfigSources,
        constants: stakeStateConfigConstants,
      },
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and desposit them
    const depositAmount0 = THRESHOLDS[7].add(1);
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);

    const blockTime0_ = await getBlockTimestamp();

    await logic.initialize(
      {
        sources: [source],
        constants: [stake.address, ...THRESHOLDS],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const result0 = await logic.stackTop();

    const expectedReport0 = numArrayToReport([
      blockTime0_,
      blockTime0_,
      blockTime0_,
      blockTime0_,
      blockTime0_,
      blockTime0_,
      blockTime0_,
      blockTime0_,
    ]);

    assert(
      result0.eq(expectedReport0),
      `did not return correct stake report after first deposit
      expected  ${hexlify(expectedReport0)}
      got       ${hexlify(result0)}`
    );

    await timewarp(86400);

    const withdrawAmount = ethers.BigNumber.from(4000 + sixZeros);
    await stake
      .connect(alice)
      .withdraw(withdrawAmount, alice.address, alice.address);

    await logic.initialize(
      {
        sources: [source],
        constants: [stake.address, ...THRESHOLDS],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const result1 = await logic.stackTop();

    const expectedReport1 = numArrayToReport([
      blockTime0_,
      blockTime0_,
      blockTime0_,
      blockTime0_,
      0xffffffff,
      0xffffffff,
      0xffffffff,
      0xffffffff,
    ]);

    assert(
      result1.eq(expectedReport1),
      `did not return correct stake report after withdraw
      expected  ${hexlify(expectedReport1)}
      got       ${hexlify(result1)}`
    );

    await token.connect(alice).approve(stake.address, withdrawAmount);
    await stake.connect(alice).deposit(withdrawAmount, alice.address);

    const blockTime1_ = await getBlockTimestamp();

    await logic.initialize(
      {
        sources: [source],
        constants: [stake.address, ...THRESHOLDS],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const result2 = await logic.stackTop();

    const expectedReport2 = numArrayToReport([
      blockTime0_,
      blockTime0_,
      blockTime0_,
      blockTime0_,
      blockTime1_,
      blockTime1_,
      blockTime1_,
      blockTime1_,
    ]);

    assert(
      result2.eq(expectedReport2),
      `did not return correct stake report after second deposit
      expected  ${hexlify(expectedReport2)}
      got       ${hexlify(result2)}`
    );
  });

  it("should return a correct report using ITIERV2_REPORT when staked tokens exceeded 1st threshold until some were withdrawn, and then deposited again to exceed 1st threshold", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeStateConfigConstants = [max_uint256, max_uint256]; // setting deposits and withdrawals to max

    const max_deposit = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );

    const stakeStateConfigSources = [max_deposit, max_withdraw];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      expressionDeployer: expressionDeployer.address,
      interpreter: interpreter.address,
      stateConfig: {
        sources: stakeStateConfigSources,
        constants: stakeStateConfigConstants,
      },
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and desposit them
    const depositAmount0 = THRESHOLDS[0].add(1);
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);

    const blockTime0_ = await getBlockTimestamp();

    await logic.initialize(
      {
        sources: [source],
        constants: [stake.address, ...THRESHOLDS],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const result0 = await logic.stackTop();

    const expectedReport0 = numArrayToReport([
      blockTime0_,
      0xffffffff,
      0xffffffff,
      0xffffffff,
      0xffffffff,
      0xffffffff,
      0xffffffff,
      0xffffffff,
    ]);

    assert(
      result0.eq(expectedReport0),
      `did not return correct stake report after first deposit
      expected  ${hexlify(expectedReport0)}
      got       ${hexlify(result0)}`
    );

    await timewarp(86400);

    const withdrawAmount = 100;
    await stake
      .connect(alice)
      .withdraw(withdrawAmount, alice.address, alice.address);

    await logic.initialize(
      {
        sources: [source],
        constants: [stake.address, ...THRESHOLDS],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const result1 = await logic.stackTop();

    const expectedReport1 = numArrayToReport([
      0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff,
      0xffffffff, 0xffffffff,
    ]);

    assert(
      result1.eq(expectedReport1),
      `did not return correct stake report after withdraw
      expected  ${hexlify(expectedReport1)}
      got       ${hexlify(result1)}`
    );

    await token.connect(alice).approve(stake.address, withdrawAmount);
    await stake.connect(alice).deposit(withdrawAmount, alice.address);

    const blockTime1_ = await getBlockTimestamp();

    await logic.initialize(
      {
        sources: [source],
        constants: [stake.address, ...THRESHOLDS],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const result2 = await logic.stackTop();

    const expectedReport2 = numArrayToReport([
      blockTime1_,
      0xffffffff,
      0xffffffff,
      0xffffffff,
      0xffffffff,
      0xffffffff,
      0xffffffff,
      0xffffffff,
    ]);

    assert(
      result2.eq(expectedReport2),
      `did not return correct stake report after second deposit, where Tier ONE time should be blockTime1_ and not blockTime0_
      expected  ${hexlify(expectedReport2)}
      got       ${hexlify(result2)}`
    );
  });

  it("should return one-to-many reports using ITIERV2_REPORT i.e. when different lists of thresholds are checked against", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeStateConfigConstants = [max_uint256, max_uint256]; // setting deposits and withdrawals to max

    const max_deposit = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );

    const stakeStateConfigSources = [max_deposit, max_withdraw];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      expressionDeployer: expressionDeployer.address,
      interpreter: interpreter.address,
      stateConfig: {
        sources: stakeStateConfigSources,
        constants: stakeStateConfigConstants,
      },
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and desposit them
    const depositAmount0 = THRESHOLDS[3].add(1);
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);

    const depositTimestamp0 = await getBlockTimestamp();

    const thresholds0 = THRESHOLDS;
    const thresholds1 = [1500, 2500, 3500, 4500, 5500, 6500, 7500, 8500].map(
      (value) => ethers.BigNumber.from(value + sixZeros)
    );

    // Passing context data in constants
    // prettier-ignore
    const source0 = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract
        op(Opcode.CALLER), // address
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // context
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 4)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 5)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 6)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 7)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 8)),
      op(Opcode.ITIERV2_REPORT, thresholds0.length),
    ]);

    await logic.initialize(
      {
        sources: [source0],
        constants: [stake.address, ...thresholds0],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const result0 = await logic.stackTop();

    // Passing context data in constants
    const source1 = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract
      op(Opcode.CALLER), // address
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)),
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)),
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 4)),
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 5)),
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 6)),
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 7)),
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 8)),
      op(Opcode.ITIERV2_REPORT, thresholds1.length),
    ]);

    await logic.initialize(
      {
        sources: [source1],
        constants: [stake.address, ...thresholds1],
      },
      [1]
    );

    await logic.connect(alice)["run()"]();

    const result1 = await logic.stackTop();

    const expected0 = numArrayToReport([
      depositTimestamp0,
      depositTimestamp0,
      depositTimestamp0,
      depositTimestamp0,
      0xffffffff,
      0xffffffff,
      0xffffffff,
      0xffffffff,
    ]);
    const expected1 = numArrayToReport([
      depositTimestamp0,
      depositTimestamp0,
      depositTimestamp0,
      0xffffffff, // not enough to reach tier 4 according to `thresholds1`
      0xffffffff,
      0xffffffff,
      0xffffffff,
      0xffffffff,
    ]);

    assert(
      result0.eq(expected0),
      `did not return correct stake result0
      expected  ${hexlify(expected0)}
      got       ${hexlify(result0)}`
    );
    assert(
      result1.eq(expected1),
      `did not return correct stake result1
      expected  ${hexlify(expected1)}
      got       ${hexlify(result1)}`
    );
  });
});
