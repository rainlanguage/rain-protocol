import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { Rainterpreter, RainterpreterExpressionDeployer, ReserveToken18, StakeFactory } from "../../typechain";
import { StakeConfigStruct } from "../../typechain/contracts/stake/Stake";
import { memoryOperand, MemoryType, op, Opcode, zeroAddress } from "../../utils";
import { eighteenZeros, max_uint256, ONE, sixZeros } from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import { rainterpreterDeploy } from "../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployer } from "../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import { stakeDeploy } from "../../utils/deploy/stake/deploy";
import { stakeFactoryDeploy } from "../../utils/deploy/stake/stakeFactory/deploy";
import { getBlockTimestamp, timewarp } from "../../utils/hardhat";
import { getDeposits } from "../../utils/stake/deposits";
import { assertError } from "../../utils/test/assertError";

describe("Stake withdraw", async function () {
  let stakeFactory: StakeFactory;
  let token: ReserveToken18;
  let interpreter: Rainterpreter;
  let expressionDeployer: RainterpreterExpressionDeployer;

  before(async () => {
    stakeFactory = await stakeFactoryDeploy();
    interpreter = await rainterpreterDeploy();
    expressionDeployer = await rainterpreterExpressionDeployer(interpreter);
  });

  beforeEach(async () => {
    token = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await token.initialize();
  }); 

  it("should cap maxWithdraw at minimum of max_deposit source and ERC4262 max_deposit", async function () {  

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const TEN = ethers.BigNumber.from("10" + eighteenZeros);

    const constants = [max_uint256,TEN] 

    const max_deposit = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    ); 

    const source = [concat([max_deposit]) , concat([max_withdraw])] // max_deposit set to 10 

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address, 
      expressionDeployer : expressionDeployer.address , 
      interpreter : interpreter.address , 
      stateConfig : {
        sources : source  , 
        constants : constants
      }
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    const depositsAlice0_ = await getDeposits(stake, alice.address);
    assert(depositsAlice0_.length === 0);

    // Give Alice some reserve tokens and deposit them
    await token.transfer(
      alice.address,
      ethers.BigNumber.from("1000" + eighteenZeros)
    );
    const tokenBalanceAlice0 = await token.balanceOf(alice.address);
    await token.connect(alice).approve(stake.address, tokenBalanceAlice0);
    await stake.connect(alice).deposit(tokenBalanceAlice0, alice.address);

    const depositsAlice1_ = await getDeposits(stake, alice.address);
    const time1_ = await getBlockTimestamp();
    assert(depositsAlice1_.length === 1);
    assert(depositsAlice1_[0].timestamp === time1_);
    assert(depositsAlice1_[0].amount.eq(tokenBalanceAlice0));

    await timewarp(86400); 

    const stTokenBalanceAlice0 = await stake.balanceOf(alice.address); 
    const tokenPool0 = await token.balanceOf(stake.address);
    
    await timewarp(86400);  

    await stake
      .connect(alice)
      .withdraw(TEN, alice.address, alice.address); 

    const stTokenBalanceAlice1 = await stake.balanceOf(alice.address); 
    const tokenBalanceAlice1 = await token.balanceOf(alice.address);

    assert(stTokenBalanceAlice1.eq(tokenBalanceAlice0.sub(TEN)), "did not burn alice's stTokens");
    assert(
      tokenBalanceAlice1.eq(TEN),
      `alice did not receive correct pro rata share of tokens from stake contract when withdrawing
      expected  ${TEN}
      got       ${tokenBalanceAlice1}`
    );

    // Alice withdraws all stake tokens
    const depositsAlice2_ = await getDeposits(stake, alice.address); 
    assert(depositsAlice2_.length === 1);
    assert(depositsAlice2_[0].amount.eq(tokenPool0.sub(tokenBalanceAlice1)));  

    await timewarp(86400);  
    
    
    await assertError(
      async () => {
        await stake
        .connect(alice)
        .withdraw(TEN.add(ONE), alice.address, alice.address);   // withdrawAmount > max_withdraw
      } , 
      "VM Exception while processing transaction: reverted with reason string 'ERC4626: withdraw more than max'",
      "wrongly deposited amount grater than MAX_DEPOSIT"
    );
       
  });

  it("should not process an invalid withdraw", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeStateConfigConstants = [max_uint256,max_uint256]  // setting deposits and withdrawals to max 

    const max_deposit = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    ); 

    const stakeStateConfigSource = [concat([max_deposit]) , concat([max_withdraw])] 

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address, 
      expressionDeployer : expressionDeployer.address , 
      interpreter : interpreter.address , 
      stateConfig : {
        sources : stakeStateConfigSource  , 
        constants : stakeStateConfigConstants
      }

    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // ZeroAddress receiver
    await assertError(
      async () =>
        await stake.connect(alice).withdraw(0, zeroAddress, alice.address),
      "0_WITHDRAW_RECEIVER",
      "wrongly processed withdraw to zeroAddress"
    );

    // ZeroAddress owner
    await assertError(
      async () =>
        await stake.connect(alice).withdraw(0, alice.address, zeroAddress),
      "0_WITHDRAW_OWNER",
      "wrongly processed withdraw from zeroAddress"
    );
  });

  it("should process multiple successive withdraws", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeStateConfigConstants = [max_uint256,max_uint256]  // setting deposits and withdrawals to max 

    const max_deposit = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    ); 

    const stakeStateConfigSource = [concat([max_deposit]) , concat([max_withdraw])] 

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address, 
      expressionDeployer : expressionDeployer.address , 
      interpreter : interpreter.address , 
      stateConfig : {
        sources : stakeStateConfigSource  , 
        constants : stakeStateConfigConstants
      }

    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    const depositsAlice0_ = await getDeposits(stake, alice.address);
    assert(depositsAlice0_.length === 0);

    // Give Alice some reserve tokens and deposit them
    await token.transfer(
      alice.address,
      ethers.BigNumber.from("1000" + sixZeros)
    );
    const tokenBalanceAlice0 = await token.balanceOf(alice.address);
    await token.connect(alice).approve(stake.address, tokenBalanceAlice0);
    await stake.connect(alice).deposit(tokenBalanceAlice0, alice.address);

    await timewarp(86400);

    await stake
      .connect(alice)
      .withdraw(tokenBalanceAlice0.div(10), alice.address, alice.address);

    await timewarp(86400);

    await stake
      .connect(alice)
      .withdraw(tokenBalanceAlice0.div(10), alice.address, alice.address);
  });

  it("should calculate new highwater when amount withdrawn less than old highwater", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];
    const bob = signers[3];

    const stakeStateConfigConstants = [max_uint256,max_uint256]  // setting deposits and withdrawals to max 

    const max_deposit = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    ); 

    const stakeStateConfigSource = [concat([max_deposit]) , concat([max_withdraw])] 

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address, 
      expressionDeployer : expressionDeployer.address , 
      interpreter : interpreter.address , 
      stateConfig : {
        sources : stakeStateConfigSource  , 
        constants : stakeStateConfigConstants
      }

    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice some reserve tokens and deposit them
    await token.transfer(
      alice.address,
      ethers.BigNumber.from("1000" + sixZeros)
    );
    const tokenBalanceAlice0 = await token.balanceOf(alice.address);
    await token.connect(alice).approve(stake.address, tokenBalanceAlice0);
    await stake.connect(alice).deposit(tokenBalanceAlice0, alice.address);

    // Give Bob some reserve tokens and deposit them
    await token.transfer(bob.address, ethers.BigNumber.from("1000" + sixZeros));
    const tokenBalanceBob0 = await token.balanceOf(bob.address);
    await token.connect(bob).approve(stake.address, tokenBalanceBob0);
    await stake.connect(bob).deposit(tokenBalanceBob0, bob.address);

    // Alice and Bob each own 50% of stToken supply
    const stTokenBalanceAlice0 = await stake.balanceOf(alice.address);

    await stake
      .connect(alice)
      .withdraw(stTokenBalanceAlice0.div(2), alice.address, alice.address);

    const stTokenBalanceAlice1 = await stake.balanceOf(alice.address);

    assert(
      stTokenBalanceAlice1.eq(stTokenBalanceAlice0.div(2)),
      "alice has wrong stToken balance after withdraw less than highwater"
    );
  });

  it("amount withdrawn cannot be larger than old highwater", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];
    const bob = signers[3];

    const stakeStateConfigConstants = [max_uint256,max_uint256]  // setting deposits and withdrawals to max 

    const max_deposit = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    ); 

    const stakeStateConfigSource = [concat([max_deposit]) , concat([max_withdraw])] 

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address, 
      expressionDeployer : expressionDeployer.address , 
      interpreter : interpreter.address , 
      stateConfig : {
        sources : stakeStateConfigSource  , 
        constants : stakeStateConfigConstants
      }

    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice some reserve tokens and deposit them
    await token.transfer(
      alice.address,
      ethers.BigNumber.from("1000" + eighteenZeros)
    );
    const tokenBalanceAlice0 = await token.balanceOf(alice.address);
    await token.connect(alice).approve(stake.address, tokenBalanceAlice0);
    await stake.connect(alice).deposit(tokenBalanceAlice0, alice.address);

    // Give Bob some reserve tokens and deposit them
    await token.transfer(
      bob.address,
      ethers.BigNumber.from("1000" + eighteenZeros)
    );
    const tokenBalanceBob0 = await token.balanceOf(bob.address);
    await token.connect(bob).approve(stake.address, tokenBalanceBob0);
    await stake.connect(bob).deposit(tokenBalanceBob0, bob.address);

    // Alice and Bob each own 50% of stToken supply
    const stTokenBalanceAlice0 = await stake.balanceOf(alice.address);

    await assertError(
      async () =>
        await stake
          .connect(alice)
          .withdraw(stTokenBalanceAlice0.add(1), alice.address, alice.address),
      "ERC4626: withdraw more than max",
      "overdrew when performing withdraw"
    );
  });

  it("should process full withdraw (withdraws equal highwater)", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];
    const bob = signers[3];

    const stakeStateConfigConstants = [max_uint256,max_uint256]  // setting deposits and withdrawals to max 

    const max_deposit = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    ); 

    const stakeStateConfigSource = [concat([max_deposit]) , concat([max_withdraw])] 

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address, 
      expressionDeployer : expressionDeployer.address , 
      interpreter : interpreter.address , 
      stateConfig : {
        sources : stakeStateConfigSource  , 
        constants : stakeStateConfigConstants
      }

    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice some reserve tokens and deposit them
    await token.transfer(
      alice.address,
      ethers.BigNumber.from("1000" + eighteenZeros)
    );
    const tokenBalanceAlice0 = await token.balanceOf(alice.address);
    await token.connect(alice).approve(stake.address, tokenBalanceAlice0);
    await stake.connect(alice).deposit(tokenBalanceAlice0, alice.address);

    // Give Bob some reserve tokens and deposit them
    await token.transfer(
      bob.address,
      ethers.BigNumber.from("1000" + eighteenZeros)
    );
    const tokenBalanceBob0 = await token.balanceOf(bob.address);
    await token.connect(bob).approve(stake.address, tokenBalanceBob0);
    await stake.connect(bob).deposit(tokenBalanceBob0, bob.address);

    // Alice and Bob each own 50% of stToken supply
    const stTokenBalanceAlice0 = await stake.balanceOf(alice.address);
    const stTokenBalanceBob0 = await stake.balanceOf(bob.address);

    const tokenPool0 = await token.balanceOf(stake.address);

    // Alice redeems all her stTokens to withdraw share of tokens she is entitled to
    await stake
      .connect(alice)
      .withdraw(stTokenBalanceAlice0, alice.address, alice.address);

    const stTokenBalanceAlice1 = await stake.balanceOf(alice.address);
    const tokenBalanceAlice1 = await token.balanceOf(alice.address);

    assert(stTokenBalanceAlice1.isZero(), "did not burn alice's stTokens");
    assert(
      tokenBalanceAlice1.eq(tokenPool0.div(2)),
      `alice did not receive correct pro rata share of tokens from stake contract when withdrawing
      expected  ${tokenPool0.div(2)}
      got       ${tokenBalanceAlice1}`
    );

    // Bob redeems all his stTokens to withdraw share of tokens he is entitled to
    await stake
      .connect(bob)
      .withdraw(stTokenBalanceBob0, bob.address, bob.address);

    const stTokenBalanceBob1 = await stake.balanceOf(bob.address);
    const tokenBalanceBob1 = await token.balanceOf(bob.address);
    const tokenPool1 = await token.balanceOf(stake.address);

    assert(stTokenBalanceBob1.isZero(), "did not burn bob's stTokens");
    assert(
      tokenBalanceBob1.eq(tokenPool0.div(2)),
      `bob did not receive correct pro rata share of tokens from stake contract when withdrawing
      expected  ${tokenPool0.div(2)}
      got       ${tokenBalanceBob1}`
    );
    assert(
      tokenPool1.isZero(),
      "did not burn all remaining stake tokens when bob withdrew all remaining reserve tokens"
    );
  });

  it("should not process a withdraw of 0 amount", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeStateConfigConstants = [max_uint256,max_uint256]  // setting deposits and withdrawals to max 

    const max_deposit = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    ); 

    const stakeStateConfigSource = [concat([max_deposit]) , concat([max_withdraw])] 

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address, 
      expressionDeployer : expressionDeployer.address , 
      interpreter : interpreter.address , 
      stateConfig : {
        sources : stakeStateConfigSource  , 
        constants : stakeStateConfigConstants
      }

    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    await assertError(
      async () =>
        await stake.connect(alice).withdraw(0, alice.address, alice.address),
      "0_WITHDRAW_ASSETS",
      "wrongly processed withdraw of 0 stTokens"
    );
  });

  it("should process withdraws (withdraw equals highwater)", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];
    const bob = signers[3];

    const constants = [max_uint256,max_uint256] 

    const max_deposit = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    ); 

    const source = [concat([max_deposit]) , concat([max_withdraw])] // max_deposit set to 10 

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address, 
      expressionDeployer : expressionDeployer.address , 
      interpreter : interpreter.address , 
      stateConfig : {
        sources : source  , 
        constants : constants
      }
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    const depositsAlice0_ = await getDeposits(stake, alice.address);
    assert(depositsAlice0_.length === 0);

    // Give Alice some reserve tokens and deposit them
    await token.transfer(
      alice.address,
      ethers.BigNumber.from("1000" + sixZeros)
    );
    const tokenBalanceAlice0 = await token.balanceOf(alice.address);
    await token.connect(alice).approve(stake.address, tokenBalanceAlice0);
    await stake.connect(alice).deposit(tokenBalanceAlice0, alice.address);

    const depositsAlice1_ = await getDeposits(stake, alice.address);
    const time1_ = await getBlockTimestamp();
    assert(depositsAlice1_.length === 1);
    assert(depositsAlice1_[0].timestamp === time1_);
    assert(depositsAlice1_[0].amount.eq(tokenBalanceAlice0));

    await timewarp(86400);

    // Give Bob some reserve tokens and deposit them
    await token.transfer(bob.address, ethers.BigNumber.from("1000" + sixZeros));
    const tokenBalanceBob0 = await token.balanceOf(bob.address);
    await token.connect(bob).approve(stake.address, tokenBalanceBob0);
    await stake.connect(bob).deposit(tokenBalanceBob0, bob.address);

    const depositsBob1_ = await getDeposits(stake, bob.address);
    const time2_ = await getBlockTimestamp();
    assert(depositsBob1_.length === 1);
    assert(depositsBob1_[0].timestamp === time2_);
    assert(depositsBob1_[0].amount.eq(tokenBalanceBob0));

    // Alice and Bob each own 50% of stToken supply
    const stTokenBalanceAlice0 = await stake.balanceOf(alice.address); 
    
    const stTokenBalanceBob0 = await stake.balanceOf(bob.address);
    
    assert(
      stTokenBalanceAlice0.eq(stTokenBalanceBob0),
      "alice and bob do not own equal amounts of stToken when initialRatio = 1 and when they deposited same amount of token"
    );

    const tokenPool0 = await token.balanceOf(stake.address);
    
    await timewarp(86400);

    // Alice redeems all her stTokens to withdraw share of tokens she is entitled to
    await stake
      .connect(alice)
      .withdraw(stTokenBalanceAlice0, alice.address, alice.address);

    const stTokenBalanceAlice1 = await stake.balanceOf(alice.address); 
    const tokenBalanceAlice1 = await token.balanceOf(alice.address);
    
    assert(stTokenBalanceAlice1.isZero(), "did not burn alice's stTokens");
    assert(
      tokenBalanceAlice1.eq(tokenPool0.div(2)),
      `alice did not receive correct pro rata share of tokens from stake contract when withdrawing
      expected  ${tokenPool0.div(2)}
      got       ${tokenBalanceAlice1}`
    );

    // Alice withdraws all stake tokens
    const depositsAlice2_ = await getDeposits(stake, alice.address);
    assert(depositsAlice2_.length === 0);
  });
});


