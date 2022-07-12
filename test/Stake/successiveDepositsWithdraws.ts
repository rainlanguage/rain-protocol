import { hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { ReserveToken } from "../../typechain/ReserveToken";
import { StakeConfigStruct } from "../../typechain/Stake";
import { StakeFactory } from "../../typechain/StakeFactory";
import { ReportOMeter } from "../../typechain/ReportOMeter";
import { ONE, sixZeros } from "../../utils/constants/bigNumber";
import { THRESHOLDS } from "../../utils/constants/stake";
import { basicDeploy } from "../../utils/deploy/basic";
import { stakeDeploy } from "../../utils/deploy/stake";
import { assert } from "chai";

describe("Stake many successive deposits and withdraws", async function () {
  let stakeFactory: StakeFactory;
  let reportOMeter: ReportOMeter;
  let token: ReserveToken;

  before(async () => {
    const stakeFactoryFactory = await ethers.getContractFactory(
      "StakeFactory",
      {}
    );
    stakeFactory = (await stakeFactoryFactory.deploy()) as StakeFactory;
    await stakeFactory.deployed();

    const reportOMeterFactory = await ethers.getContractFactory(
      "ReportOMeter",
      {}
    );
    reportOMeter = (await reportOMeterFactory.deploy()) as ReportOMeter;
    await reportOMeter.deployed();
  });

  beforeEach(async () => {
    token = (await basicDeploy("ReserveToken", {})) as ReserveToken;
  });

  it("should process 50 successive deposits and withdraws", async function () {
    // stake supply should also track token pool size (assuming all token transferred to Stake contract via `deposit()` function)

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

    for (let i_ = 0; i_ < 50; i_++) {
      // Give Alice some reserve tokens and deposit them
      await token.transfer(
        alice.address,
        ethers.BigNumber.from("1000" + sixZeros)
      );
      const tokenBalanceAlice = await token.balanceOf(alice.address);
      await token.connect(alice).approve(stake.address, tokenBalanceAlice);
      await stake.connect(alice).deposit(tokenBalanceAlice);

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
      await stake.connect(bob).deposit(tokenBalanceBob);

      const tokenPoolSize1_ = await token.balanceOf(stake.address);
      const totalSupply1_ = await stake.totalSupply();
      assert(
        totalSupply1_.eq(tokenPoolSize1_),
        `total supply no longer tracking token pool size
        tokenPool   ${tokenPoolSize1_}
        totalSupply ${totalSupply1_}`
      );

      // const stTokenBalanceAlice = await stake.balanceOf(alice.address);
      // const stTokenBalanceBob = await stake.balanceOf(bob.address);

      // Alice redeems half of her stTokens
      // await stake.connect(alice).withdraw(stTokenBalanceAlice.div(2));

      // const tokenPoolSize2_ = await token.balanceOf(stake.address);
      // const totalSupply2_ = await stake.totalSupply();
      // assert(
      //   totalSupply2_.eq(tokenPoolSize2_),
      //   `total supply no longer tracking token pool size
      //   tokenPool   ${tokenPoolSize2_}
      //   totalSupply ${totalSupply2_}`
      // );

      // Bob redeems half of his stTokens
      // await stake.connect(bob).withdraw(stTokenBalanceBob.div(2));

      // const tokenPoolSize3_ = await token.balanceOf(stake.address);
      // const totalSupply3_ = await stake.totalSupply();
      // assert(
      //   totalSupply3_.eq(tokenPoolSize3_),
      //   `total supply no longer tracking token pool size
      //   tokenPool   ${tokenPoolSize3_}
      //   totalSupply ${totalSupply3_}`
      // );
    }

    const thresholds = THRESHOLDS;

    const reportAlice = await stake.report(alice.address, thresholds);
    const reportBob = await stake.report(bob.address, thresholds);

    const reportHexAlice = hexlify(reportAlice);
    const reportHexBob = hexlify(reportBob);

    console.log({ reportHexAlice, reportHexBob });

    await reportOMeter.gaugeReportTimeForTier(stake.address, alice.address, 0, [
      ethers.BigNumber.from("1000" + "000000000"),
    ]);
  });

  it("should process 25 successive deposits and withdraws", async function () {
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

    for (let i_ = 0; i_ < 25; i_++) {
      // Give Alice some reserve tokens and deposit them
      await token.transfer(
        alice.address,
        ethers.BigNumber.from("1000" + sixZeros)
      );
      const tokenBalanceAlice = await token.balanceOf(alice.address);
      await token.connect(alice).approve(stake.address, tokenBalanceAlice);
      await stake.connect(alice).deposit(tokenBalanceAlice);

      // Give Bob some reserve tokens and deposit them
      await token.transfer(
        bob.address,
        ethers.BigNumber.from("1000" + sixZeros)
      );
      const tokenBalanceBob = await token.balanceOf(bob.address);
      await token.connect(bob).approve(stake.address, tokenBalanceBob);
      await stake.connect(bob).deposit(tokenBalanceBob);

      // const stTokenBalanceAlice = await stake.balanceOf(alice.address);
      // const stTokenBalanceBob = await stake.balanceOf(bob.address);

      // Alice redeems half of her stTokens
      // await stake.connect(alice).withdraw(stTokenBalanceAlice.div(2));
      // Bob redeems half of his stTokens
      // await stake.connect(bob).withdraw(stTokenBalanceBob.div(2));
    }

    const thresholds = THRESHOLDS;

    const reportAlice = await stake.report(alice.address, thresholds);
    const reportBob = await stake.report(bob.address, thresholds);

    const reportHexAlice = hexlify(reportAlice);
    const reportHexBob = hexlify(reportBob);

    console.log({ reportHexAlice, reportHexBob });

    await reportOMeter.gaugeReportTimeForTier(stake.address, alice.address, 0, [
      ethers.BigNumber.from("1000" + "000000000"),
    ]);
  });

  it("should process 10 successive deposits and withdraws", async function () {
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

    for (let i_ = 0; i_ < 10; i_++) {
      // Give Alice some reserve tokens and deposit them
      await token.transfer(
        alice.address,
        ethers.BigNumber.from("1000" + sixZeros)
      );
      const tokenBalanceAlice = await token.balanceOf(alice.address);
      await token.connect(alice).approve(stake.address, tokenBalanceAlice);
      await stake.connect(alice).deposit(tokenBalanceAlice);

      // Give Bob some reserve tokens and deposit them
      await token.transfer(
        bob.address,
        ethers.BigNumber.from("1000" + sixZeros)
      );
      const tokenBalanceBob = await token.balanceOf(bob.address);
      await token.connect(bob).approve(stake.address, tokenBalanceBob);
      await stake.connect(bob).deposit(tokenBalanceBob);

      // const stTokenBalanceAlice = await stake.balanceOf(alice.address);
      // const stTokenBalanceBob = await stake.balanceOf(bob.address);

      // // Alice redeems half of her stTokens
      // await stake.connect(alice).withdraw(stTokenBalanceAlice.div(2));
      // // Bob redeems half of his stTokens
      // await stake.connect(bob).withdraw(stTokenBalanceBob.div(2));
    }

    const thresholds = THRESHOLDS;

    const reportAlice = await stake.report(alice.address, thresholds);
    const reportBob = await stake.report(bob.address, thresholds);

    const reportHexAlice = hexlify(reportAlice);
    const reportHexBob = hexlify(reportBob);

    console.log({ reportHexAlice, reportHexBob });

    await reportOMeter.gaugeReportTimeForTier(stake.address, alice.address, 0, [
      ethers.BigNumber.from("1000" + "000000000"),
    ]);
  });
});
