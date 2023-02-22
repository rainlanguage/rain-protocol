import { assert } from "chai";
import { ethers } from "hardhat";
import { CloneFactory, ReserveToken } from "../../typechain";
import { NewCloneEvent } from "../../typechain/contracts/factory/CloneFactory";
import {
  InitializeEvent,
  Stake,
  StakeConfigStruct,
} from "../../typechain/contracts/stake/Stake";
import {
  generateEvaluableConfig,
  max_uint16,
  max_uint256,
  memoryOperand,
  MemoryType,
  op,
  Opcode,
  stakeImplementation,
} from "../../utils";
import { zeroAddress } from "../../utils/constants/address";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import deploy1820 from "../../utils/deploy/registry1820/deploy";

import { getEventArgs } from "../../utils/events";
import { assertError } from "../../utils/test/assertError";
import { compareStructs } from "../../utils/test/compareStructs";

describe("Stake construction", async function () {
  let implementation: Stake;
  let cloneFactory: CloneFactory;
  let token: ReserveToken;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementation = await stakeImplementation();

    //Deploy Clone Factory
    cloneFactory = (await basicDeploy("CloneFactory", {})) as CloneFactory;
  });

  beforeEach(async () => {
    token = (await basicDeploy("ReserveToken", {})) as ReserveToken;
  });

  it("should not initialize if requirements not met", async function () {
    const constants = [max_uint256, max_uint16];

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
    const stakeConfigStructZeroToken: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: zeroAddress,
      evaluableConfig: evaluableConfig,
    };

    const encodedConfig = ethers.utils.defaultAbiCoder.encode(
      [
        "tuple(address asset ,string name, string symbol , tuple(address deployer,bytes[] sources,uint256[] constants) evaluableConfig)",
      ],
      [stakeConfigStructZeroToken]
    );

    await assertError(
      async () =>
        await cloneFactory.clone(implementation.address, encodedConfig),
      "ZeroAsset()",
      "wrongly initialised Stake with token configured as 0 address"
    );
  });

  it("should initialize correctly on the good path", async function () {
    const constants = [max_uint256, max_uint16];

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

    const encodedConfig = ethers.utils.defaultAbiCoder.encode(
      [
        "tuple(address asset ,string name, string symbol , tuple(address deployer,bytes[] sources,uint256[] constants) evaluableConfig)",
      ],
      [stakeConfigStruct]
    );

    const stakeClone = await cloneFactory.clone(
      implementation.address,
      encodedConfig
    );

    const cloneEvent = (await getEventArgs(
      stakeClone,
      "NewClone",
      cloneFactory
    )) as NewCloneEvent["args"];

    assert(!(cloneEvent.clone === zeroAddress), "stake clone zero address");

    const stake = (await ethers.getContractAt(
      "Stake",
      cloneEvent.clone
    )) as Stake;

    const { sender, config } = (await getEventArgs(
      stakeClone,
      "Initialize",
      stake
    )) as InitializeEvent["args"];

    assert(sender === cloneFactory.address, "wrong sender in Initialize event");

    compareStructs(config, stakeConfigStruct);
  });
});
