import { assert } from "chai";
import { ethers } from "hardhat";
import { CloneFactory, ReportOMeter, ReserveToken18 } from "../../typechain";
import {
  Stake,
  StakeConfigStruct,
} from "../../typechain/contracts/stake/Stake";
import {
  generateEvaluableConfig,
  memoryOperand,
  MemoryType,
  op,
  Opcode,
  stakeCloneDeploy,
  stakeImplementation,
} from "../../utils";
import { max_uint256, sixZeros } from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import deploy1820 from "../../utils/deploy/registry1820/deploy";

import { reportOMeterDeploy } from "../../utils/deploy/test/tier/ITierV2/ReportOMeter/deploy";

describe("Stake many successive deposits and withdraws", async function () {
  let implementation: Stake;
  let cloneFactory: CloneFactory;
  let reportOMeter: ReportOMeter;
  let token: ReserveToken18;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementation = await stakeImplementation();

    //Deploy Clone Factory
    cloneFactory = (await basicDeploy("CloneFactory", {})) as CloneFactory;
    reportOMeter = await reportOMeterDeploy();
  });

  beforeEach(async () => {
    token = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await token.initialize();
  });

  it("should process 50 successive deposits and withdraws", async function () {
    // stake supply should also track token pool size (assuming all token transferred to Stake contract via `deposit()` function)

    const signers = await ethers.getSigners();

    const alice = signers[2];
    const bob = signers[3];

    const stakeExpressionConfigConstants = [max_uint256, max_uint256]; // setting deposits and withdrawals to max

    const max_deposit = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );

    const stakeExpressionConfigSources = [max_deposit, max_withdraw];

    const evaluableConfig = await generateEvaluableConfig(
      stakeExpressionConfigSources,
      stakeExpressionConfigConstants
    );

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      evaluableConfig: evaluableConfig,
    };

    const stake = await stakeCloneDeploy(
      cloneFactory,
      implementation,
      stakeConfigStruct
    );

    for (let i_ = 0; i_ < 50; i_++) {
      // Give Alice some reserve tokens and deposit them
      await token.transfer(
        alice.address,
        ethers.BigNumber.from("1000" + sixZeros)
      );
      const tokenBalanceAlice = await token.balanceOf(alice.address);
      await token.connect(alice).approve(stake.address, tokenBalanceAlice);
      await stake.connect(alice).deposit(tokenBalanceAlice, alice.address);

      const tokenPoolSize0_ = await token.balanceOf(stake.address);
      const totalSupply0_ = await stake.totalSupply();
      assert(
        totalSupply0_.eq(tokenPoolSize0_),
        `total supply no longer tracking token pool size
        tokenPool   ${tokenPoolSize0_}
        totalSupply ${totalSupply0_}`
      );

      // Give Bob some reserve tokens and deposit them
      await token.transfer(
        bob.address,
        ethers.BigNumber.from("1000" + sixZeros)
      );
      const tokenBalanceBob = await token.balanceOf(bob.address);
      await token.connect(bob).approve(stake.address, tokenBalanceBob);
      await stake.connect(bob).deposit(tokenBalanceBob, bob.address);

      const tokenPoolSize1_ = await token.balanceOf(stake.address);
      const totalSupply1_ = await stake.totalSupply();
      assert(
        totalSupply1_.eq(tokenPoolSize1_),
        `total supply no longer tracking token pool size
        tokenPool   ${tokenPoolSize1_}
        totalSupply ${totalSupply1_}`
      );

      const stTokenBalanceAlice = await stake.balanceOf(alice.address);
      const stTokenBalanceBob = await stake.balanceOf(bob.address);

      //   Alice redeems half of her stTokens
      await stake
        .connect(alice)
        .withdraw(stTokenBalanceAlice.div(2), alice.address, alice.address);

      const tokenPoolSize2_ = await token.balanceOf(stake.address);
      const totalSupply2_ = await stake.totalSupply();
      assert(
        totalSupply2_.eq(tokenPoolSize2_),
        `total supply no longer tracking token pool size
        tokenPool   ${tokenPoolSize2_}
        totalSupply ${totalSupply2_}`
      );

      // Bob redeems half of his stTokens
      await stake
        .connect(bob)
        .withdraw(stTokenBalanceBob.div(2), bob.address, bob.address);

      const tokenPoolSize3_ = await token.balanceOf(stake.address);
      const totalSupply3_ = await stake.totalSupply();
      assert(
        totalSupply3_.eq(tokenPoolSize3_),
        `total supply no longer tracking token pool size
        tokenPool   ${tokenPoolSize3_}
        totalSupply ${totalSupply3_}`
      );
    }

    await reportOMeter.gaugeReportTimeForTier(stake.address, alice.address, 0, [
      ethers.BigNumber.from("1000" + "000000000"),
    ]);
  });

  it("should process 25 successive deposits and withdraws", async function () {
    const signers = await ethers.getSigners();

    const alice = signers[2];
    const bob = signers[3];

    const stakeExpressionConfigConstants = [max_uint256, max_uint256]; // setting deposits and withdrawals to max

    const max_deposit = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );

    const stakeExpressionConfigSources = [max_deposit, max_withdraw];

    const evaluableConfig = await generateEvaluableConfig(
      stakeExpressionConfigSources,
      stakeExpressionConfigConstants
    );

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      evaluableConfig: evaluableConfig,
    };

    const stake = await stakeCloneDeploy(
      cloneFactory,
      implementation,
      stakeConfigStruct
    );

    for (let i_ = 0; i_ < 25; i_++) {
      // Give Alice some reserve tokens and deposit them
      await token.transfer(
        alice.address,
        ethers.BigNumber.from("1000" + sixZeros)
      );
      const tokenBalanceAlice = await token.balanceOf(alice.address);
      await token.connect(alice).approve(stake.address, tokenBalanceAlice);
      await stake.connect(alice).deposit(tokenBalanceAlice, alice.address);

      // Give Bob some reserve tokens and deposit them
      await token.transfer(
        bob.address,
        ethers.BigNumber.from("1000" + sixZeros)
      );
      const tokenBalanceBob = await token.balanceOf(bob.address);
      await token.connect(bob).approve(stake.address, tokenBalanceBob);
      await stake.connect(bob).deposit(tokenBalanceBob, bob.address);

      const stTokenBalanceAlice = await stake.balanceOf(alice.address);
      const stTokenBalanceBob = await stake.balanceOf(bob.address);

      //   Alice redeems half of her stTokens
      await stake
        .connect(alice)
        .withdraw(stTokenBalanceAlice.div(2), alice.address, alice.address);
      //   Bob redeems half of his stTokens
      await stake
        .connect(bob)
        .withdraw(stTokenBalanceBob.div(2), bob.address, bob.address);
    }

    await reportOMeter.gaugeReportTimeForTier(stake.address, alice.address, 0, [
      ethers.BigNumber.from("1000" + "000000000"),
    ]);
  });

  it("should process 10 successive deposits and withdraws", async function () {
    const signers = await ethers.getSigners();

    const alice = signers[2];
    const bob = signers[3];

    const stakeExpressionConfigConstants = [max_uint256, max_uint256]; // setting deposits and withdrawals to max

    const max_deposit = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );

    const stakeExpressionConfigSources = [max_deposit, max_withdraw];

    const evaluableConfig = await generateEvaluableConfig(
      stakeExpressionConfigSources,
      stakeExpressionConfigConstants
    );

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      evaluableConfig: evaluableConfig,
    };

    const stake = await stakeCloneDeploy(
      cloneFactory,
      implementation,
      stakeConfigStruct
    );

    for (let i_ = 0; i_ < 10; i_++) {
      // Give Alice some reserve tokens and deposit them
      await token.transfer(
        alice.address,
        ethers.BigNumber.from("1000" + sixZeros)
      );
      const tokenBalanceAlice = await token.balanceOf(alice.address);
      await token.connect(alice).approve(stake.address, tokenBalanceAlice);
      await stake.connect(alice).deposit(tokenBalanceAlice, alice.address);

      // Give Bob some reserve tokens and deposit them
      await token.transfer(
        bob.address,
        ethers.BigNumber.from("1000" + sixZeros)
      );
      const tokenBalanceBob = await token.balanceOf(bob.address);
      await token.connect(bob).approve(stake.address, tokenBalanceBob);
      await stake.connect(bob).deposit(tokenBalanceBob, bob.address);

      // const stTokenBalanceAlice = await stake.balanceOf(alice.address);
      // const stTokenBalanceBob = await stake.balanceOf(bob.address);

      // // Alice redeems half of her stTokens
      // await stake.connect(alice).withdraw(stTokenBalanceAlice.div(2));
      // // Bob redeems half of his stTokens
      // await stake.connect(bob).withdraw(stTokenBalanceBob.div(2));
    }

    await reportOMeter.gaugeReportTimeForTier(stake.address, alice.address, 0, [
      ethers.BigNumber.from("1000" + "000000000"),
    ]);
  });
});
