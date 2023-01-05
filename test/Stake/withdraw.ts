import { assert } from "chai";
import { ethers } from "hardhat";
import { ReserveToken } from "../../typechain/ReserveToken";
import { StakeConfigStruct } from "../../typechain/Stake";
import { StakeFactory } from "../../typechain/StakeFactory";
import { getDeposits, op, Opcode } from "../../utils";
import { max_uint256, ONE, sixZeros, eighteenZeros } from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basic";
import { stakeDeploy } from "../../utils/deploy/stake";
import { assertError } from "../../utils/test/assertError";
import { getBlockTimestamp, timewarp } from '../../utils/hardhat/index';

describe("Stake withdraw", async function () {
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

  it("should calculate new highwater when amount withdrawn less than old highwater", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];
    const bob = signers[3];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      token: token.address,
      initialRatio: ONE,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice some reserve tokens and deposit them
    await token.transfer(
      alice.address,
      ethers.BigNumber.from("1000" + sixZeros)
    );
    const tokenBalanceAlice0 = await token.balanceOf(alice.address);
    await token.connect(alice).approve(stake.address, tokenBalanceAlice0);
    await stake.connect(alice).deposit(tokenBalanceAlice0);

    // Give Bob some reserve tokens and deposit them
    await token.transfer(bob.address, ethers.BigNumber.from("1000" + sixZeros));
    const tokenBalanceBob0 = await token.balanceOf(bob.address);
    await token.connect(bob).approve(stake.address, tokenBalanceBob0);
    await stake.connect(bob).deposit(tokenBalanceBob0);

    // Alice and Bob each own 50% of stToken supply
    const stTokenBalanceAlice0 = await stake.balanceOf(alice.address);

    await stake.connect(alice).withdraw(stTokenBalanceAlice0.div(2));

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

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      token: token.address,
      initialRatio: ONE,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice some reserve tokens and deposit them
    await token.transfer(
      alice.address,
      ethers.BigNumber.from("1000" + sixZeros)
    );
    const tokenBalanceAlice0 = await token.balanceOf(alice.address);
    await token.connect(alice).approve(stake.address, tokenBalanceAlice0);
    await stake.connect(alice).deposit(tokenBalanceAlice0);

    // Give Bob some reserve tokens and deposit them
    await token.transfer(bob.address, ethers.BigNumber.from("1000" + sixZeros));
    const tokenBalanceBob0 = await token.balanceOf(bob.address);
    await token.connect(bob).approve(stake.address, tokenBalanceBob0);
    await stake.connect(bob).deposit(tokenBalanceBob0);

    // Alice and Bob each own 50% of stToken supply
    const stTokenBalanceAlice0 = await stake.balanceOf(alice.address);

    await assertError(
      async () =>
        await stake.connect(alice).withdraw(stTokenBalanceAlice0.add(1)),
      "reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)",
      "overdrew when performing withdraw"
    );
  });

  it("should process full withdraw (withdraws equal highwater)", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];
    const bob = signers[3];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      token: token.address,
      initialRatio: ONE,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice some reserve tokens and deposit them
    await token.transfer(
      alice.address,
      ethers.BigNumber.from("1000" + sixZeros)
    );
    const tokenBalanceAlice0 = await token.balanceOf(alice.address);
    await token.connect(alice).approve(stake.address, tokenBalanceAlice0);
    await stake.connect(alice).deposit(tokenBalanceAlice0);

    // Give Bob some reserve tokens and deposit them
    await token.transfer(bob.address, ethers.BigNumber.from("1000" + sixZeros));
    const tokenBalanceBob0 = await token.balanceOf(bob.address);
    await token.connect(bob).approve(stake.address, tokenBalanceBob0);
    await stake.connect(bob).deposit(tokenBalanceBob0);

    // Alice and Bob each own 50% of stToken supply
    const stTokenBalanceAlice0 = await stake.balanceOf(alice.address);
    const stTokenBalanceBob0 = await stake.balanceOf(bob.address);

    const tokenPool0 = await token.balanceOf(stake.address);

    // Alice redeems all her stTokens to withdraw share of tokens she is entitled to
    await stake.connect(alice).withdraw(stTokenBalanceAlice0);

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
    await stake.connect(bob).withdraw(stTokenBalanceBob0);

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

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      token: token.address,
      initialRatio: ONE,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    await assertError(
      async () => await stake.connect(alice).withdraw(0),
      "0_AMOUNT",
      "wrongly processed withdraw of 0 stTokens"
    );
  });

  it("should process withdraws (withdraw equals highwater)", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];
    const bob = signers[3];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      token: token.address,
      initialRatio: ONE,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice some reserve tokens and deposit them
    await token.transfer(
      alice.address,
      ethers.BigNumber.from("1000" + sixZeros)
    );
    const tokenBalanceAlice0 = await token.balanceOf(alice.address);
    await token.connect(alice).approve(stake.address, tokenBalanceAlice0);
    await stake.connect(alice).deposit(tokenBalanceAlice0);

    // Give Bob some reserve tokens and deposit them
    await token.transfer(bob.address, ethers.BigNumber.from("1000" + sixZeros));
    const tokenBalanceBob0 = await token.balanceOf(bob.address);
    await token.connect(bob).approve(stake.address, tokenBalanceBob0);
    await stake.connect(bob).deposit(tokenBalanceBob0);

    // Alice and Bob each own 50% of stToken supply
    const stTokenBalanceAlice0 = await stake.balanceOf(alice.address);
    const stTokenBalanceBob0 = await stake.balanceOf(bob.address);

    assert(
      stTokenBalanceAlice0.eq(stTokenBalanceBob0),
      "alice and bob do not own equal amounts of stToken when initialRatio = 1 and when they deposited same amount of token"
    );

    const tokenPool0 = await token.balanceOf(stake.address);

    // Alice redeems all her stTokens to withdraw share of tokens she is entitled to
    await stake.connect(alice).withdraw(stTokenBalanceAlice0);

    const stTokenBalanceAlice1 = await stake.balanceOf(alice.address);
    const tokenBalanceAlice1 = await token.balanceOf(alice.address);

    assert(stTokenBalanceAlice1.isZero(), "did not burn alice's stTokens");
    assert(
      tokenBalanceAlice1.eq(tokenPool0.div(2)),
      `alice did not receive correct pro rata share of tokens from stake contract when withdrawing
      expected  ${tokenPool0.div(2)}
      got       ${tokenBalanceAlice1}`
    );
  });

  it('should monitor user deposit on multiple deposits and withdraws', async () => {
    /**
     * all tokens and calculations are in 18 decimals
     * 1. Alice deposits 10 tokens
     * 2. Alice deposits 10 tokens
     * 3. Alice withdraws 10 tokens
     * 4. Alice withdraws 1 token
     * 5. Alice withdraws 10 tokens => revert
     * 6. Alice deposits 1 token
     * 7. Alice withdraws 1 token
     * 8. Alice withdraws 1 token
     * 9. Alice withdraws 10 token => revert
     */
    token = (await basicDeploy("ReserveToken18", {})) as ReserveToken;
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

    const depositsAlice0_ = await getDeposits(stake, alice.address);
    assert(depositsAlice0_.length === 0);

    // Give Alice some reserve tokens and deposit them
    await token.transfer(
      alice.address,
      ethers.BigNumber.from("10" + eighteenZeros)
    );

    //Deposits 10 tokens
    const tokenBalanceAlice0 = await token.balanceOf(alice.address);
    await token.connect(alice).approve(stake.address, tokenBalanceAlice0);
    await stake.connect(alice).deposit(tokenBalanceAlice0);

    const depositsAlice1_ = await getDeposits(stake, alice.address);
    const time1_ = await getBlockTimestamp();
    assert(depositsAlice1_[0].timestamp === time1_);
    assert(depositsAlice1_[0].amount.eq(tokenBalanceAlice0));

    await timewarp(86400);

    //Deposits 10 more tokens
    await token.transfer(alice.address, ethers.BigNumber.from("10" + eighteenZeros));
    const tokenBalanceAlice1 = await token.balanceOf(alice.address);
    await token.connect(alice).approve(stake.address, tokenBalanceAlice1);
    await stake.connect(alice).deposit(tokenBalanceAlice1);

    const depositsAlice2_ = await getDeposits(stake, alice.address);
    const time2_ = await getBlockTimestamp();
    assert(depositsAlice2_[1].timestamp === time2_);

    //because on last deposit, there will be accure amount of 2 consecutive deposits
    assert(depositsAlice2_[1].amount.eq(tokenBalanceAlice1.add(tokenBalanceAlice0)));

    await timewarp(86400);

    //withdraw 10 tokens
    await stake.connect(alice).withdraw(tokenBalanceAlice1);
    const withdrawsAlice0_ = await getDeposits(stake, alice.address);
    assert(withdrawsAlice0_[0].timestamp === time1_);
    assert(withdrawsAlice0_[0].amount.eq(tokenBalanceAlice0));

    //withdraw 1 token
    await stake.connect(alice).withdraw(ONE);
    const withdrawsAlice1_ = await getDeposits(stake, alice.address);
    assert(withdrawsAlice1_[0].timestamp === time1_);
    assert(withdrawsAlice1_[0].amount.eq(tokenBalanceAlice0.sub(ONE)));

    //withdraw 10 tokens, this should REVERT
    await assertError(
      async () =>
        await stake.connect(alice).withdraw(tokenBalanceAlice0),
      "reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)",
      "overdrew when performing withdraw"
    );

    //deposit 1 token process deposit
    await token.transfer(alice.address, ethers.BigNumber.from("1" + eighteenZeros));
    const tokenBalanceAlice3 = await token.balanceOf(alice.address);
    await token.connect(alice).approve(stake.address, tokenBalanceAlice3);
    await stake.connect(alice).deposit(ONE);
    
    const time3_ = await getBlockTimestamp();
    const depositsAlice3_ = await getDeposits(stake, alice.address);
    assert(depositsAlice3_[1].timestamp === time3_);
    assert(depositsAlice3_[1].amount.eq(tokenBalanceAlice0));

    //withdraw 1 token
    await stake.connect(alice).withdraw(ONE);
    const withdrawsAlice3_ = await getDeposits(stake, alice.address);
    assert(withdrawsAlice3_[0].timestamp === time1_);
    assert(withdrawsAlice3_[0].amount.eq(tokenBalanceAlice0.sub(ONE)));

    //wtidraw 1 token
    await stake.connect(alice).withdraw(ONE);
    const withdrawsAlice4_ = await getDeposits(stake, alice.address);
    assert(withdrawsAlice4_[0].timestamp === time1_);
    assert(withdrawsAlice4_[0].amount.eq(tokenBalanceAlice0.sub(ONE).sub(ONE)));

    //withdraw 10 tokens, this should REVERT
    await assertError(
      async () => {
        await stake
          .connect(alice)
          .withdraw(tokenBalanceAlice0); // withdrawAmount > max_withdraw
      },
      "reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block",
      "wrongly deposited amount grater than MAX_DEPOSIT"
    );

    //get deposits
    const depositsAlice_ = await getDeposits(stake, alice.address);
    assert(depositsAlice_[0].timestamp === time1_);
    assert(depositsAlice_[0].amount.eq(tokenBalanceAlice0.sub(ONE).sub(ONE)));
    
  })
});
