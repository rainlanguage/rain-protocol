import { assert } from "chai";
import { hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { ReserveToken } from "../../typechain/ReserveToken";
import { StakeConfigStruct } from "../../typechain/Stake";
import { StakeFactory } from "../../typechain/StakeFactory";
import { max_uint256, ONE, sixZeros } from "../../utils/constants/bigNumber";
import { THRESHOLDS } from "../../utils/constants/stake";
import { basicDeploy } from "../../utils/deploy/basic";
import { stakeDeploy } from "../../utils/deploy/stake";
import { getBlockTimestamp } from "../../utils/hardhat";
import { numArrayToReport } from "../../utils/tier";

describe("Stake report", async function () {
  let stakeFactory: StakeFactory;
  let token: ReserveToken;

  before(async () => {
    const stakeFactoryFactory = await ethers.getContractFactory(
      "StakeFactory",
      {}
    );
    stakeFactory = (await stakeFactoryFactory.deploy()) as StakeFactory;
    await stakeFactory.deployed();
  });

  beforeEach(async () => {
    token = (await basicDeploy("ReserveToken", {})) as ReserveToken;
  });

  it("should return one-to-many reports i.e. when different lists of thresholds are checked against", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      token: token.address,
      initialRatio: ONE,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and desposit them
    const depositAmount0 = THRESHOLDS[3].add(1);
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0);

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
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      token: token.address,
      initialRatio: ONE,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and desposit them
    const depositAmount0 = THRESHOLDS[7].add(1);
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0);

    const depositTimestamp = await getBlockTimestamp();

    const thresholds = THRESHOLDS;

    const report = await stake.report(alice.address, thresholds);

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
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      token: token.address,
      initialRatio: ONE,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    await stake.report(alice.address, []);
    // Give Alice reserve tokens and desposit them
    const depositAmount0 = THRESHOLDS[1].add(1);
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0);

    const depositTimestamp0 = await getBlockTimestamp();

    const thresholds = THRESHOLDS;

    const report0 = await stake.report(alice.address, thresholds);

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

    // Give Alice reserve tokens and desposit them
    const depositAmount1 = THRESHOLDS[3].sub(depositAmount0);
    await token.transfer(alice.address, depositAmount1);
    await token.connect(alice).approve(stake.address, depositAmount1);
    await stake.connect(alice).deposit(depositAmount1);

    const depositTimestamp1 = await getBlockTimestamp();

    const report1 = await stake.report(alice.address, thresholds);

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
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      token: token.address,
      initialRatio: ONE,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and desposit them
    const depositAmount0 = THRESHOLDS[0].add(1);
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0);

    const depositTimestamp = await getBlockTimestamp();

    const thresholds = THRESHOLDS;

    const report = await stake.report(alice.address, thresholds);

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
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      token: token.address,
      initialRatio: ONE,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and desposit them
    const depositAmount0 = THRESHOLDS[0].div(2);
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0);

    const thresholds = THRESHOLDS;

    const report = await stake.report(alice.address, thresholds);

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
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      token: token.address,
      initialRatio: ONE,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    const thresholds = THRESHOLDS;

    const report = await stake.report(alice.address, thresholds);

    assert(report.eq(max_uint256), "did not return a NEVER report");
  });
});
