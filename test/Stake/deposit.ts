import { assert } from "chai";
import { ethers } from "hardhat";
import { ReserveToken } from "../../typechain/ReserveToken";
import { StakeConfigStruct } from "../../typechain/Stake";
import { StakeFactory } from "../../typechain/StakeFactory";
import { ONE, sixZeros } from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basic";
import { stakeDeploy } from "../../utils/deploy/stake";
import { assertError } from "../../utils/test/assertError";

describe("Stake deposit", async function () {
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

  it("should calculate correct mint amounts based on current supply", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[1];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      token: token.address,
      initialRatio: ONE,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    const amount = ethers.BigNumber.from("1000" + sixZeros);

    const tokenPoolSize0_ = await token.balanceOf(stake.address);
    const totalSupply0_ = await stake.totalSupply();
    assert(tokenPoolSize0_.eq(totalSupply0_));
    assert(tokenPoolSize0_.isZero());

    // Alice deposits reserve tokens
    await token.transfer(alice.address, amount);
    await token.connect(alice).approve(stake.address, amount);
    await stake.connect(alice).deposit(amount);

    const expectedMint0 = amount.mul(stakeConfigStruct.initialRatio).div(ONE);
    const actualMint0 = await stake.totalSupply();

    assert(
      expectedMint0.eq(actualMint0),
      `wrong amount minted when supply == 0
      expected  ${expectedMint0}
      got       ${actualMint0}`
    );

    const tokenPoolSize1_ = await token.balanceOf(stake.address);
    const totalSupply1_ = await stake.totalSupply();
    assert(tokenPoolSize1_.eq(totalSupply1_));

    // Alice deposits more reserve tokens
    await token.transfer(alice.address, amount);
    await token.connect(alice).approve(stake.address, amount);
    await stake.connect(alice).deposit(amount);

    const expectedMint1 = actualMint0.mul(amount).div(tokenPoolSize1_);
    const actualMint1 = (await stake.totalSupply()).sub(actualMint0);

    assert(
      expectedMint1.eq(actualMint1),
      `wrong amount minted when supply > 0
      expected  ${expectedMint1}
      got       ${actualMint1}`
    );
  });

  it("should revert deposit if mint amount is calculated to be 0", async function () {
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

    // Alice deposits 3 reserve tokens
    await token.transfer(alice.address, 3);
    await token.connect(alice).approve(stake.address, 3);
    await stake.connect(alice).deposit(3);

    // Malicious actor sends token directly to contract to cause mintAmount_ to round down to 0
    await token.transfer(stake.address, 10);

    // Bob deposits 3 reserve tokens
    await token.transfer(bob.address, 3);
    await token.connect(bob).approve(stake.address, 3);
    await assertError(
      async () => await stake.connect(bob).deposit(3),
      "0_MINT",
      "did not protect bob from a deposit which would give him back 0 stTokens"
    );
  });

  it("should not process a deposit of 0 amount", async function () {
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

    await token.connect(alice).approve(stake.address, 0);
    await assertError(
      async () => await stake.connect(alice).deposit(0),
      "0_AMOUNT",
      "wrongly processed deposit of 0 tokens"
    );
  });

  it("should process minimum deposit of 1 token", async function () {
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

    // Give Alice some reserve tokens and deposit them
    await token.transfer(alice.address, 2);
    await token.connect(alice).approve(stake.address, 1);
    await stake.connect(alice).deposit(1);
    await token.connect(alice).approve(stake.address, 1);
    await stake.connect(alice).deposit(1);
  });

  it("should process deposit of 2 tokens", async function () {
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

    // Give Alice some reserve tokens and deposit them
    await token.transfer(alice.address, 4);
    await token.connect(alice).approve(stake.address, 2);
    await stake.connect(alice).deposit(2);
    await token.connect(alice).approve(stake.address, 2);
    await stake.connect(alice).deposit(2);
  });

  it("should process deposits", async function () {
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

    // Give Alice some reserve tokens
    await token.transfer(
      alice.address,
      ethers.BigNumber.from("1000" + sixZeros)
    );

    const tokenBalanceAlice0 = await token.balanceOf(alice.address);
    const stTokenSupply0 = await stake.totalSupply();

    assert(stTokenSupply0.isZero(), "initial stToken supply was not 0");

    // deposit some of Alice's tokens
    await token
      .connect(alice)
      .approve(stake.address, tokenBalanceAlice0.div(10));
    await stake.connect(alice).deposit(tokenBalanceAlice0.div(10));

    const tokenBalanceAlice1 = await token.balanceOf(alice.address);
    const stTokenBalanceAlice1 = await stake.balanceOf(alice.address);
    const stTokenSupply1 = await stake.totalSupply();

    assert(
      tokenBalanceAlice1.eq(tokenBalanceAlice0.sub(tokenBalanceAlice0.div(10))),
      "deposit did not transfer correct token amount to Stake contract"
    );
    assert(
      !stTokenSupply1.isZero(),
      "no stToken was minted after first deposit"
    );
    assert(
      !stTokenBalanceAlice1.isZero(),
      "alice did not receive stToken upon depositing token"
    );
    assert(
      stTokenBalanceAlice1.eq(stTokenSupply1),
      "alice balance was not equal to total stToken supply"
    );

    // deposit more of Alice's tokens
    await token
      .connect(alice)
      .approve(stake.address, tokenBalanceAlice0.div(10));
    await stake.connect(alice).deposit(tokenBalanceAlice0.div(10));

    const tokenBalanceAlice2 = await token.balanceOf(alice.address);
    const stTokenBalanceAlice2 = await stake.balanceOf(alice.address);
    const stTokenSupply2 = await stake.totalSupply();

    assert(
      tokenBalanceAlice2.eq(tokenBalanceAlice1.sub(tokenBalanceAlice0.div(10))),
      "deposit did not transfer correct token amount to Stake contract"
    );
    assert(
      !stTokenSupply2.isZero(),
      "no stToken was minted after first deposit"
    );
    assert(
      !stTokenBalanceAlice2.isZero(),
      "alice did not receive stToken upon depositing token"
    );
    assert(
      stTokenBalanceAlice2.eq(stTokenSupply2),
      "alice balance was not equal to total stToken supply"
    );
  });

  it("burn amount issue", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    // Transfer tokens from the deployer to the alice with the instances
    const amountToTransfer = '50000000';
    await token.connect(deployer).approve(alice.address, amountToTransfer);
    const reserveToken = token.connect(alice);
    await reserveToken.transferFrom(
      deployer.address,
      alice.address,
      amountToTransfer
    );
    
    console.log("userA balance of reserveToken before deploying the stake contract:   " + (await reserveToken.balanceOf(alice.address)))
    console.log("--------------------------------------------------------------------")

    console.log("deploying the stake contract with initial ratio of 1:1")
    console.log("--------------------------------------------------------------------")

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      token: token.address,
      initialRatio: "1000000000000000000000000000000",
    };

    const stake = await stakeDeploy(alice, stakeFactory, stakeConfigStruct);
    console.log("stake contract deployed")
    console.log("--------------------------------------------------------------------")

    console.log("stToken totalSupply before deposit:   " + (await stake.totalSupply()))
    console.log("reserveToken balance of stake contract before deposit:   " + (await reserveToken.balanceOf(stake.address)))
    console.log("--------------------------------------------------------------------")

    console.log("userA depositing 20 reserveToken into stake")
    await reserveToken.approve(stake.address, ethers.constants.MaxUint256);
    await stake.deposit("20000000")
    console.log("--------------------------------------------------------------------")

    console.log("stToken totalSupply after deposit:   " + (await stake.totalSupply()))
    console.log("reserveToken balance of stake contract after deposit:   " + (await reserveToken.balanceOf(stake.address)))
    console.log("userA balance of stToken after depositing into stake:   " + (await stake.balanceOf(alice.address)))
    console.log("userA balance of reserveToken after depositing into stake:   " + (await reserveToken.balanceOf(alice.address)))
    console.log("--------------------------------------------------------------------")

    console.log("userA withdrawing 10 reserveToken from stake")
    await stake.withdraw("10000000")
    console.log("--------------------------------------------------------------------")

    console.log("stToken totalSupply after withdraw:   " + (await stake.totalSupply()))
    console.log("reserveToken balance of stake contract after withdraw:   " + (await reserveToken.balanceOf(stake.address)))
    console.log("userA balance of stToken after withdrawing from stake:   " + (await stake.balanceOf(alice.address)))
    console.log("userA balance of reserveToken after withdrawing from stake:   " + (await reserveToken.balanceOf(alice.address)))

  });
});
