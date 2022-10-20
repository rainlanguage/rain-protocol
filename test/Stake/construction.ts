import { assert } from "chai";
import { ethers } from "hardhat";
import { ReserveToken, StakeFactory } from "../../typechain";
import {
  InitializeEvent,
  StakeConfigStruct,
} from "../../typechain/contracts/stake/Stake";
import { zeroAddress } from "../../utils/constants/address";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import { stakeDeploy } from "../../utils/deploy/stake/deploy";
import { getEventArgs } from "../../utils/events";
import { assertError } from "../../utils/test/assertError";
import { compareStructs } from "../../utils/test/compareStructs";

describe("Stake construction", async function () {
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

  it("should not initialize if requirements not met", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const stakeConfigStructZeroToken: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: zeroAddress,
    };

    await assertError(
      async () =>
        await stakeDeploy(deployer, stakeFactory, stakeConfigStructZeroToken),
      "0_ASSET",
      "wrongly initialised Stake with token configured as 0 address"
    );
  });

  it("should initialize correctly on the good path", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    const { sender, config } = (await getEventArgs(
      stake.deployTransaction,
      "Initialize",
      stake
    )) as InitializeEvent["args"];

    assert(sender === stakeFactory.address, "wrong sender in Initialize event");

    compareStructs(config, stakeConfigStruct);
  });
});
