import * as Util from "../../utils";
import { assert } from "chai";
import { artifacts, ethers } from "hardhat";
import { Contract, ContractFactory, Overrides } from "ethers";
import type { StakeFactory } from "../../typechain/StakeFactory";
import type {
  Stake,
  InitializeEvent,
  StakeConfigStruct,
} from "../../typechain/Stake";
import { ReserveToken } from "../../typechain/ReserveToken";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

let stakeFactoryFactory: ContractFactory,
  stakeFactory: StakeFactory & Contract,
  token: ReserveToken & Contract;

const stakeDeploy = async (
  deployer: SignerWithAddress,
  stakeConfigStruct: StakeConfigStruct,
  ...args: Overrides[]
): Promise<Stake & Contract> => {
  const txDeploy = await stakeFactory.createChildTyped(
    stakeConfigStruct,
    ...args
  );

  const stake = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await Util.getEventArgs(txDeploy, "NewChild", stakeFactory)).child
      ),
      20 // address bytes length
    ),
    (await artifacts.readArtifact("Stake")).abi,
    deployer
  ) as Stake & Contract;

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  stake.deployTransaction = txDeploy;

  return stake;
};

describe("Stake", async function () {
  beforeEach(async () => {
    token = (await Util.basicDeploy("ReserveToken", {})) as ReserveToken &
      Contract;
  });

  before(async () => {
    stakeFactoryFactory = await ethers.getContractFactory("StakeFactory", {});
    stakeFactory = (await stakeFactoryFactory.deploy()) as StakeFactory &
      Contract;
    await stakeFactory.deployed();
  });

  it("should return a correct report", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      token: token.address,
      initialRatio: Util.ONE,
    };

    const stake = await stakeDeploy(deployer, stakeConfigStruct);

    await stake.report(alice.address, []);
  });

  it("should not process a withdraw of 0 amount", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      token: token.address,
      initialRatio: Util.ONE,
    };

    const stake = await stakeDeploy(deployer, stakeConfigStruct);

    await Util.assertError(
      async () => await stake.connect(alice).withdraw(0),
      "0_AMOUNT",
      "wrongly processed withdraw of 0 stTokens"
    );
  });

  it("should process withdraws", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];
    const bob = signers[3];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      token: token.address,
      initialRatio: Util.ONE,
    };

    const stake = await stakeDeploy(deployer, stakeConfigStruct);

    // Give Alice some reserve tokens and deposit them
    await token.transfer(
      alice.address,
      ethers.BigNumber.from("1000" + Util.sixZeros)
    );
    const tokenBalanceAlice0 = await token.balanceOf(alice.address);
    await token.connect(alice).approve(stake.address, tokenBalanceAlice0);
    await stake.connect(alice).deposit(tokenBalanceAlice0);

    // Give Bob some reserve tokens and deposit them
    await token.transfer(
      bob.address,
      ethers.BigNumber.from("1000" + Util.sixZeros)
    );
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

  it("should revert if mint amount is calculated to be 0", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];
    const bob = signers[3];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      token: token.address,
      initialRatio: Util.ONE,
    };

    const stake = await stakeDeploy(deployer, stakeConfigStruct);

    // Alice deposits 3 reserve tokens
    await token.transfer(alice.address, 3);
    await token.connect(alice).approve(stake.address, 3);
    await stake.connect(alice).deposit(3);

    // Malicious actor sends token directly to contract to cause mintAmount_ to round down to 0
    await token.transfer(stake.address, 10);

    // Bob deposits 3 reserve tokens
    await token.transfer(bob.address, 3);
    await token.connect(bob).approve(stake.address, 3);
    await Util.assertError(
      async () => await stake.connect(bob).deposit(3),
      "0_MINT",
      "did not protect bob from a deposit which would give him back 0 stTokens"
    );
  });

  it("should not process a deposit of 0 amount", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      token: token.address,
      initialRatio: Util.ONE,
    };

    const stake = await stakeDeploy(deployer, stakeConfigStruct);

    await token.connect(alice).approve(stake.address, 0);
    await Util.assertError(
      async () => await stake.connect(alice).deposit(0),
      "0_AMOUNT",
      "wrongly processed deposit of 0 tokens"
    );
  });

  it("should process minimum deposit of 1 token", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      token: token.address,
      initialRatio: Util.ONE,
    };

    const stake = await stakeDeploy(deployer, stakeConfigStruct);

    // Give Alice some reserve tokens and deposit them
    await token.transfer(alice.address, 2);
    await token.connect(alice).approve(stake.address, 1);
    await stake.connect(alice).deposit(1);
    await token.connect(alice).approve(stake.address, 1);
    await stake.connect(alice).deposit(1);
  });

  it("should process deposits", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      token: token.address,
      initialRatio: Util.ONE,
    };

    const stake = await stakeDeploy(deployer, stakeConfigStruct);

    // Give Alice some reserve tokens
    await token.transfer(
      alice.address,
      ethers.BigNumber.from("1000" + Util.sixZeros)
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

  it("should not initialize if requirements not met", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const stakeConfigStructZeroToken: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      token: Util.zeroAddress,
      initialRatio: Util.ONE,
    };

    await Util.assertError(
      async () => await stakeDeploy(deployer, stakeConfigStructZeroToken),
      "0_TOKEN",
      "wrongly initialised Stake with token configured as 0 address"
    );

    const stakeConfigStructZeroRatio: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      token: token.address,
      initialRatio: 0,
    };

    await Util.assertError(
      async () => await stakeDeploy(deployer, stakeConfigStructZeroRatio),
      "0_RATIO",
      "wrongly initialised Stake with initialRatio of 0"
    );
  });

  it("should initialize correctly on the good path", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      token: token.address,
      initialRatio: Util.ONE,
    };

    const stake = await stakeDeploy(deployer, stakeConfigStruct);

    const { sender, config } = (await Util.getEventArgs(
      stake.deployTransaction,
      "Initialize",
      stake
    )) as InitializeEvent["args"];

    assert(sender === stakeFactory.address, "wrong sender in Initialize event");

    Util.compareStructs(config, stakeConfigStruct);
  });
});
