import { assert } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { ReserveToken18, StakeFactory } from "../../typechain";
import { StakeConfigStruct } from "../../typechain/contracts/stake/Stake";
import {
  generateEvaluableConfig,
  max_uint256,
  memoryOperand,
  MemoryType,
  op,
  Opcode,
} from "../../utils";
import { THRESHOLDS } from "../../utils/constants/stake";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import deploy1820 from "../../utils/deploy/registry1820/deploy";
import { stakeDeploy } from "../../utils/deploy/stake/deploy";
import { stakeFactoryDeploy } from "../../utils/deploy/stake/stakeFactory/deploy";
import { getBlockTimestamp, timewarp } from "../../utils/hardhat";
import { getDeposits } from "../../utils/stake/deposits";

describe("Stake direct ledger analysis", async function () {
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

  it("should correctly update `deposits` ledger in FILO order when multiple ledger entries are consumed by a single withdrawal", async () => {
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

    // Give Alice reserve tokens and deposit them over a series of deposits
    const totalDepositAmount = ethers.BigNumber.from("10000");
    const depositAmount = totalDepositAmount.div(16);
    await token.transfer(alice.address, totalDepositAmount);
    await token.connect(alice).approve(stake.address, totalDepositAmount);

    const time0_ = await getBlockTimestamp();

    for (let i = 0; i < 16; i++) {
      await stake.connect(alice).deposit(depositAmount, alice.address);
      await timewarp(86400);
    }
    const depositsAlice0_ = await getDeposits(stake, alice.address);

    assert(depositsAlice0_.length === 16);
    depositsAlice0_.forEach((depositItem, index) => {
      const expectedTime = time0_ + index * 86400;
      assert(
        // rough timestamp check
        depositItem.timestamp >= expectedTime - 100 &&
          depositItem.timestamp <= expectedTime + 100,
        `wrong timestamp
          expected  ${expectedTime}
          got       ${depositItem.timestamp}
          index     ${index}`
      );
      const expectedDepositAmount = depositAmount.mul(index + 1);
      assert(
        depositItem.amount.eq(expectedDepositAmount),
        `wrong deposit amount
          expected  ${expectedDepositAmount}
          got       ${depositItem.amount}
          index     ${index}`
      );
    });

    // Alice withdraws some tokens
    const withdrawAmount = totalDepositAmount.div(4);

    await stake
      .connect(alice)
      .withdraw(withdrawAmount, alice.address, alice.address);
    const depositsAlice1_ = await getDeposits(stake, alice.address);
    const expectedAliceLength1 = 12;
    assert(
      depositsAlice1_.length === expectedAliceLength1,
      `wrong alice length 1, expected ${expectedAliceLength1} got ${depositsAlice1_.length}`
    );
    await timewarp(86400);

    await stake
      .connect(alice)
      .withdraw(withdrawAmount, alice.address, alice.address);
    const depositsAlice2_ = await getDeposits(stake, alice.address);
    const expectedAliceLength2 = 8;
    assert(
      depositsAlice2_.length === expectedAliceLength2,
      `wrong alice length 2, expected ${expectedAliceLength2} got ${depositsAlice2_.length}`
    );
    assert(depositsAlice2_.length === 8);
  });

  it("should maintain the integrity of the `deposits` ledger correctly when tokens are sent directly to contract", async () => {
    const signers = await ethers.getSigners();
    const [deployer, alice, maliciousActor] = signers;

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
    const depositAmount0 = THRESHOLDS[0].add(1); // exceeds 1st threshold
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);

    const depositsAlice0_ = await getDeposits(stake, alice.address);
    const time0_ = await getBlockTimestamp();
    assert(depositsAlice0_.length === 1);
    assert(depositsAlice0_[0].timestamp === time0_);
    assert(depositsAlice0_[0].amount.eq(depositAmount0));

    await timewarp(86400);

    // Alice withdraws some tokens
    const withdrawAmount = 100;
    await stake
      .connect(alice)
      .withdraw(withdrawAmount, alice.address, alice.address);

    const depositsAlice1_ = await getDeposits(stake, alice.address);
    const time1_ = await getBlockTimestamp();
    assert(depositsAlice1_.length === 1);
    assert(depositsAlice1_[0].timestamp !== time1_);
    assert(depositsAlice1_[0].timestamp === time0_);
    assert(depositsAlice1_[0].amount.eq(depositAmount0.sub(withdrawAmount)));

    await timewarp(86400);
    // Malicious actor sends tokens directly to the stake contract
    await token.transfer(maliciousActor.address, depositAmount0);
    await token.connect(maliciousActor).transfer(stake.address, depositAmount0);

    // Alice's ledger should remain identical
    const depositsAlice2_ = await getDeposits(stake, alice.address);
    depositsAlice2_.forEach((depositItem, index) => {
      assert(depositItem.timestamp === depositsAlice1_[index].timestamp);
      assert(depositItem.amount.eq(depositsAlice1_[index].amount));
    });
    await timewarp(86400);

    // Alice deposits again, exceeding threshold again
    const totalSupply3 = await stake.totalSupply();
    const totalAssets3 = await stake.totalAssets();

    // ERC4626Upgradable's _convertToShares implementation
    // Calculating expected share wrt the totalAssets. This will change due to the direct token transfer done by maliciousActor
    const expectedShares3_ = BigNumber.from(withdrawAmount)
      .mul(totalSupply3)
      .div(totalAssets3);

    await token.connect(alice).approve(stake.address, withdrawAmount);
    await stake.connect(alice).deposit(withdrawAmount, alice.address);

    const depositsAlice3_ = await getDeposits(stake, alice.address);
    const time2_ = await getBlockTimestamp();
    assert(depositsAlice3_.length === 2);
    assert(depositsAlice3_[0].timestamp !== time1_);
    assert(depositsAlice3_[0].timestamp === time0_);
    assert(depositsAlice3_[0].amount.eq(depositAmount0.sub(withdrawAmount)));
    assert(depositsAlice3_[1].timestamp === time2_);
    assert(
      depositsAlice3_[1].amount.eq(
        depositsAlice3_[0].amount.add(expectedShares3_)
      )
    );

    // ERC4626Upgradable's _convertToShares implementation
    // Withdrawing and validating the shares
    const totalSupply4 = await stake.totalSupply();
    const totalAssets4 = await stake.totalAssets();
    let expectedShares4_ = BigNumber.from(withdrawAmount)
      .mul(totalSupply4)
      .div(totalAssets4);
    if (
      BigNumber.from(withdrawAmount).mul(totalSupply4).mod(totalAssets4).gt(0)
    )
      expectedShares4_ = expectedShares4_.add(1);

    await stake
      .connect(alice)
      .withdraw(withdrawAmount, alice.address, alice.address);
    const depositsAlice4_ = await getDeposits(stake, alice.address);

    assert(
      depositsAlice4_[depositsAlice4_.length - 1].amount.eq(
        depositsAlice3_[1].amount.sub(expectedShares4_)
      )
    );
  });

  it("should update the `deposits` ledger correctly when depositing and withdrawing", async () => {
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
    const depositAmount0 = THRESHOLDS[0].add(1); // exceeds 1st threshold
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);

    const depositsAlice0_ = await getDeposits(stake, alice.address);
    const time0_ = await getBlockTimestamp();
    assert(depositsAlice0_.length === 1);
    assert(depositsAlice0_[0].timestamp === time0_);
    assert(depositsAlice0_[0].amount.eq(depositAmount0));

    await timewarp(86400);

    // Alice withdraws some tokens
    const withdrawAmount = 100;
    await stake
      .connect(alice)
      .withdraw(withdrawAmount, alice.address, alice.address);

    const depositsAlice1_ = await getDeposits(stake, alice.address);
    const time1_ = await getBlockTimestamp();
    assert(depositsAlice1_.length === 1);
    assert(depositsAlice1_[0].timestamp !== time1_);
    assert(depositsAlice1_[0].timestamp === time0_);
    assert(depositsAlice1_[0].amount.eq(depositAmount0.sub(withdrawAmount)));

    await timewarp(86400);

    // Alice deposits again, exceeding threshold again
    await token.connect(alice).approve(stake.address, withdrawAmount);
    await stake.connect(alice).deposit(withdrawAmount, alice.address);

    const depositsAlice2_ = await getDeposits(stake, alice.address);
    const time2_ = await getBlockTimestamp();
    assert(depositsAlice2_.length === 2);
    assert(depositsAlice2_[0].timestamp !== time1_);
    assert(depositsAlice2_[0].timestamp === time0_);
    assert(depositsAlice2_[0].amount.eq(depositAmount0.sub(withdrawAmount)));
    assert(depositsAlice2_[1].timestamp === time2_);
    assert(depositsAlice2_[1].amount.eq(depositAmount0));
  });

  it("should correctly pop the records from ledger ", async () => {
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

    // Give Alice reserve tokens and deposit them over a series of deposits
    const totalDepositAmount = ethers.BigNumber.from("1000");
    const depositAmount = totalDepositAmount.div(4);
    await token.transfer(alice.address, totalDepositAmount);
    await token.connect(alice).approve(stake.address, totalDepositAmount);

    for (let i = 0; i < 4; i++) {
      await stake.connect(alice).deposit(depositAmount, alice.address);
      await timewarp(86400);
    }
    const depositsAlice0_ = await getDeposits(stake, alice.address);
    assert(depositsAlice0_.length === 4);

    // Alice withdraws some tokens
    const withdrawAmount = totalDepositAmount.div(2);

    await stake
      .connect(alice)
      .withdraw(withdrawAmount, alice.address, alice.address);
    const depositsAlice1_ = await getDeposits(stake, alice.address);
    const expectedAliceLength1 = 2;
    assert(
      depositsAlice1_.length === expectedAliceLength1,
      `wrong alice length 1, expected ${expectedAliceLength1} got ${depositsAlice1_.length}`
    );
    await timewarp(86400);

    // Failing here as there's still an entry remaining with null values
    await stake
      .connect(alice)
      .withdraw(withdrawAmount, alice.address, alice.address);
    const depositsAlice2_ = await getDeposits(stake, alice.address);

    const expectedAliceLength2 = 0;
    assert(
      depositsAlice2_.length === expectedAliceLength2,
      `wrong alice length 2, expected ${expectedAliceLength2} got ${depositsAlice2_.length}`
    );
  });
});
