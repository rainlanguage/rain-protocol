import * as Util from "../Util";
import chai from "chai";
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

const { assert } = chai;

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

  it("should accept deposits", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      token: token.address,
    };

    const stake = await stakeDeploy(deployer, stakeConfigStruct);

    // Give Alice some reserve token
    await token.transfer(
      alice.address,
      ethers.BigNumber.from("1000" + Util.sixZeros)
    );

    const tokenBalanceAlice0 = await token.balanceOf(alice.address);
    const stTokenSupply0 = await stake.totalSupply();

    assert(stTokenSupply0.isZero(), "initial stToken supply was not 0");

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
  });

  it("should initialize correctly", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      token: token.address,
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
