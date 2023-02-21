import { assert } from "chai";
import { hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { ReserveToken18, StakeFactory } from "../../typechain";
import { StakeConfigStruct } from "../../typechain/contracts/stake/Stake";
import {
  generateEvaluableConfig,
  memoryOperand,
  MemoryType,
  op,
  Opcode,
} from "../../utils";
import { max_uint256, sixZeros } from "../../utils/constants/bigNumber";
import { THRESHOLDS } from "../../utils/constants/stake";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import deploy1820 from "../../utils/deploy/registry1820/deploy";
import { stakeDeploy } from "../../utils/deploy/stake/deploy";
import { stakeFactoryDeploy } from "../../utils/deploy/stake/stakeFactory/deploy";
import { getBlockTimestamp, timewarp } from "../../utils/hardhat";
import { numArrayToReport } from "../../utils/tier";

describe("Stake report", async function () {
  let stakeFactory: StakeFactory;
  let token: ReserveToken18;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    stakeFactory = await stakeFactoryDeploy();
  });

  beforeEach(async () => {
    token = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await token.initialize();
  });

  it("should return a correct report when staked tokens exceeded all thresholds until some were withdrawn, and then deposited again to exceed all thresholds", async function () {
    const signers = await ethers.getSigners();
    const [deployer, alice] = signers;

    const constants = [max_uint256, max_uint256]; // setting deposits and withdrawals to max

    const max_deposit = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );

    const source = [max_deposit, max_withdraw];
    const evaluableConfig = await generateEvaluableConfig(source, constants);
    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      evaluableConfig: evaluableConfig,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and deposit them
    const depositAmount0 = THRESHOLDS[7].add(1);
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);

    const blockTime0_ = await getBlockTimestamp();

    const report0_ = await stake.report(alice.address, THRESHOLDS);

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
      report0_.eq(expectedReport0),
      `did not return correct stake report after first deposit
      expected  ${hexlify(expectedReport0)}
      got       ${hexlify(report0_)}`
    );

    await timewarp(86400);

    const withdrawAmount = ethers.BigNumber.from(4000 + sixZeros);
    await stake
      .connect(alice)
      .withdraw(withdrawAmount, alice.address, alice.address);

    const report1_ = await stake.report(alice.address, THRESHOLDS);

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
      report1_.eq(expectedReport1),
      `did not return correct stake report after withdraw
      expected  ${hexlify(expectedReport1)}
      got       ${hexlify(report1_)}`
    );

    await token.connect(alice).approve(stake.address, withdrawAmount);
    await stake.connect(alice).deposit(withdrawAmount, alice.address);

    const blockTime1_ = await getBlockTimestamp();

    const report2_ = await stake.report(alice.address, THRESHOLDS);

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
      report2_.eq(expectedReport2),
      `did not return correct stake report after second deposit
      expected  ${hexlify(expectedReport2)}
      got       ${hexlify(report2_)}`
    );
  });

  it("should return a correct report when staked tokens exceeded 1st threshold until some were withdrawn, and then deposited again to exceed 1st threshold", async function () {
    const signers = await ethers.getSigners();
    const [deployer, alice] = signers;

    const constants = [max_uint256, max_uint256]; // setting deposits and withdrawals to max

    const max_deposit = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );

    const source = [max_deposit, max_withdraw];
    const evaluableConfig = await generateEvaluableConfig(source, constants);
    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      evaluableConfig: evaluableConfig,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and deposit them
    const depositAmount0 = THRESHOLDS[0].add(1);
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);

    const blockTime0_ = await getBlockTimestamp();

    const report0_ = await stake.report(alice.address, THRESHOLDS);

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
      report0_.eq(expectedReport0),
      `did not return correct stake report after first deposit
      expected  ${hexlify(expectedReport0)}
      got       ${hexlify(report0_)}`
    );

    await timewarp(86400);

    const withdrawAmount = 100;
    await stake
      .connect(alice)
      .withdraw(withdrawAmount, alice.address, alice.address);

    const report1_ = await stake.report(alice.address, THRESHOLDS);

    const expectedReport1 = numArrayToReport([
      0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff,
      0xffffffff, 0xffffffff,
    ]);

    assert(
      report1_.eq(expectedReport1),
      `did not return correct stake report after withdraw
      expected  ${hexlify(expectedReport1)}
      got       ${hexlify(report1_)}`
    );

    await token.connect(alice).approve(stake.address, withdrawAmount);
    await stake.connect(alice).deposit(withdrawAmount, alice.address);

    const blockTime1_ = await getBlockTimestamp();

    const report2_ = await stake.report(alice.address, THRESHOLDS);

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
      report2_.eq(expectedReport2),
      `did not return correct stake report after second deposit, where Tier ONE time should be blockTime1_ and not blockTime0_
      expected  ${hexlify(expectedReport2)}
      got       ${hexlify(report2_)}`
    );
  });

  it("should return one-to-many reports i.e. when different lists of thresholds are checked against", async function () {
    const signers = await ethers.getSigners();
    const [deployer, alice] = signers;

    const constants = [max_uint256, max_uint256]; // setting deposits and withdrawals to max

    const max_deposit = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );

    const source = [max_deposit, max_withdraw];
    const evaluableConfig = await generateEvaluableConfig(source, constants);
    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      evaluableConfig: evaluableConfig,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and deposit them
    const depositAmount0 = THRESHOLDS[3].add(1);
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);

    const depositTimestamp0 = await getBlockTimestamp();

    const thresholds0 = THRESHOLDS;
    const thresholds1 = [1500, 2500, 3500, 4500, 5500, 6500, 7500, 8500].map(
      (value) => ethers.BigNumber.from(value + sixZeros)
    );

    const report0 = await stake.report(alice.address, thresholds0);
    const report1 = await stake.report(alice.address, thresholds1);

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
      report0.eq(expected0),
      `did not return correct stake report0
        expected  ${hexlify(expected0)}
        got       ${hexlify(report0)}`
    );
    assert(
      report1.eq(expected1),
      `did not return correct stake report1
        expected  ${hexlify(expected1)}
        got       ${hexlify(report1)}`
    );
  });

  it("should return a correct report when enough tokens have been staked to exceed all thresholds", async function () {
    const signers = await ethers.getSigners();
    const [deployer, alice] = signers;

    const constants = [max_uint256, max_uint256]; // setting deposits and withdrawals to max

    const max_deposit = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );

    const source = [max_deposit, max_withdraw];
    const evaluableConfig = await generateEvaluableConfig(source, constants);
    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      evaluableConfig: evaluableConfig,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and deposit them
    const depositAmount0 = THRESHOLDS[7].add(1);
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);

    const depositTimestamp = await getBlockTimestamp();

    const report = await stake.report(alice.address, THRESHOLDS);

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
      report.eq(expected),
      `did not return correct stake report
        expected  ${hexlify(expected)}
        got       ${hexlify(report)}`
    );
  });

  it("should return a correct report when enough tokens have been staked to exceed the 2nd threshold then the 4th threshold", async function () {
    const signers = await ethers.getSigners();
    const [deployer, alice] = signers;

    const constants = [max_uint256, max_uint256]; // setting deposits and withdrawals to max

    const max_deposit = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );

    const source = [max_deposit, max_withdraw];
    const evaluableConfig = await generateEvaluableConfig(source, constants);
    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      evaluableConfig: evaluableConfig,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    await stake.report(alice.address, []);
    // Give Alice reserve tokens and deposit them
    const depositAmount0 = THRESHOLDS[1].add(1);
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);

    const depositTimestamp0 = await getBlockTimestamp();

    const report0 = await stake.report(alice.address, THRESHOLDS);

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
      report0.eq(expected0),
      `did not return correct stake report0
        expected  ${hexlify(expected0)}
        got       ${hexlify(report0)}`
    );

    // Give Alice reserve tokens and deposit them
    const depositAmount1 = THRESHOLDS[3].sub(depositAmount0);
    await token.transfer(alice.address, depositAmount1);
    await token.connect(alice).approve(stake.address, depositAmount1);
    await stake.connect(alice).deposit(depositAmount1, alice.address);

    const depositTimestamp1 = await getBlockTimestamp();

    const report1 = await stake.report(alice.address, THRESHOLDS);

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
      report1.eq(expected1),
      `did not return correct stake report1
        expected  ${hexlify(expected1)}
        got       ${hexlify(report1)}`
    );
  });

  it("should return a correct report when enough tokens have been staked to exceed the 1st threshold", async function () {
    const signers = await ethers.getSigners();
    const [deployer, alice] = signers;

    const constants = [max_uint256, max_uint256]; // setting deposits and withdrawals to max

    const max_deposit = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );

    const source = [max_deposit, max_withdraw];
    const evaluableConfig = await generateEvaluableConfig(source, constants);
    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      evaluableConfig: evaluableConfig,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and deposit them
    const depositAmount0 = THRESHOLDS[0].add(1);
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);

    const depositTimestamp = await getBlockTimestamp();

    const report = await stake.report(alice.address, THRESHOLDS);

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
      report.eq(expected),
      `did not return correct stake report
        expected  ${hexlify(expected)}
        got       ${hexlify(report)}`
    );
  });

  it("should return a correct report when some tokens have been staked but do not exceed the first threshold", async function () {
    const signers = await ethers.getSigners();
    const [deployer, alice] = signers;

    const constants = [max_uint256, max_uint256]; // setting deposits and withdrawals to max

    const max_deposit = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );

    const source = [max_deposit, max_withdraw];
    const evaluableConfig = await generateEvaluableConfig(source, constants);
    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      evaluableConfig: evaluableConfig,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and deposit them
    const depositAmount0 = THRESHOLDS[0].div(2);
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);

    const report = await stake.report(alice.address, THRESHOLDS);

    // const expected = numArrayToReport([0, 0, 0, 0, 0, 0, 0, 0]);
    const expected = max_uint256;

    assert(
      report.eq(expected),
      `did not return correct stake report
        expected  ${hexlify(expected)}
        got       ${hexlify(report)}`
    );
  });

  it("should return a correct report when no token has been staked", async function () {
    const signers = await ethers.getSigners();
    const [deployer, alice] = signers;

    const constants = [max_uint256, max_uint256]; // setting deposits and withdrawals to max

    const max_deposit = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );

    const source = [max_deposit, max_withdraw];
    const evaluableConfig = await generateEvaluableConfig(source, constants);
    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      evaluableConfig: evaluableConfig,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    const report = await stake.report(alice.address, THRESHOLDS);

    assert(report.eq(max_uint256), "did not return a NEVER report");
  });
});
