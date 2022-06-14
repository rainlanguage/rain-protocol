import { Contract } from "ethers";
import { hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { ReserveToken } from "../../typechain/ReserveToken";
import { StakeConfigStruct } from "../../typechain/Stake";
import { StakeFactory } from "../../typechain/StakeFactory";
import { ONE, sixZeros } from "../../utils/constants/bigNumber";
import { THRESHOLDS } from "../../utils/constants/stake";
import { basicDeploy } from "../../utils/deploy/basic";
import { stakeDeploy } from "../../utils/deploy/stake";

describe("Stake many successive deposits and withdraws", async function () {
  let stakeFactory: StakeFactory & Contract;
  let token: ReserveToken & Contract;

  before(async () => {
    const stakeFactoryFactory = await ethers.getContractFactory(
      "StakeFactory",
      {}
    );
    stakeFactory = (await stakeFactoryFactory.deploy()) as StakeFactory &
      Contract;
    await stakeFactory.deployed();
  });

  beforeEach(async () => {
    token = (await basicDeploy("ReserveToken", {})) as ReserveToken & Contract;
  });

  it("should process 50 successive deposits and withdraws", async function () {
    this.timeout(0);

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

      // Give Bob some reserve tokens and deposit them
      await token.transfer(
        bob.address,
        ethers.BigNumber.from("1000" + sixZeros)
      );
      const tokenBalanceBob = await token.balanceOf(bob.address);
      await token.connect(bob).approve(stake.address, tokenBalanceBob);
      await stake.connect(bob).deposit(tokenBalanceBob);

      const stTokenBalanceAlice = await stake.balanceOf(alice.address);
      const stTokenBalanceBob = await stake.balanceOf(bob.address);

      // Alice redeems half of her stTokens
      await stake.connect(alice).withdraw(stTokenBalanceAlice.div(2));
      // Bob redeems half of his stTokens
      await stake.connect(bob).withdraw(stTokenBalanceBob.div(2));
    }

    const thresholds = THRESHOLDS;

    const reportAlice = await stake.report(alice.address, thresholds);
    const reportBob = await stake.report(bob.address, thresholds);

    const reportHexAlice = hexlify(reportAlice);
    const reportHexBob = hexlify(reportBob);

    console.log({ reportHexAlice, reportHexBob });
  });

  it("should process 25 successive deposits and withdraws", async function () {
    this.timeout(0);

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

      const stTokenBalanceAlice = await stake.balanceOf(alice.address);
      const stTokenBalanceBob = await stake.balanceOf(bob.address);

      // Alice redeems half of her stTokens
      await stake.connect(alice).withdraw(stTokenBalanceAlice.div(2));
      // Bob redeems half of his stTokens
      await stake.connect(bob).withdraw(stTokenBalanceBob.div(2));
    }

    const thresholds = THRESHOLDS;

    const reportAlice = await stake.report(alice.address, thresholds);
    const reportBob = await stake.report(bob.address, thresholds);

    const reportHexAlice = hexlify(reportAlice);
    const reportHexBob = hexlify(reportBob);

    console.log({ reportHexAlice, reportHexBob });
  });

  it("should process 10 successive deposits and withdraws", async function () {
    this.timeout(0);

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

      const stTokenBalanceAlice = await stake.balanceOf(alice.address);
      const stTokenBalanceBob = await stake.balanceOf(bob.address);

      // Alice redeems half of her stTokens
      await stake.connect(alice).withdraw(stTokenBalanceAlice.div(2));
      // Bob redeems half of his stTokens
      await stake.connect(bob).withdraw(stTokenBalanceBob.div(2));
    }

    const thresholds = THRESHOLDS;

    const reportAlice = await stake.report(alice.address, thresholds);
    const reportBob = await stake.report(bob.address, thresholds);

    const reportHexAlice = hexlify(reportAlice);
    const reportHexBob = hexlify(reportBob);

    console.log({ reportHexAlice, reportHexBob });
  });
});
