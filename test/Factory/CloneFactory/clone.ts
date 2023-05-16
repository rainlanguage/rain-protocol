import { strict as assert } from "assert";

import { ethers } from "hardhat";
import { ReserveToken } from "../../../typechain";
import {
  CloneFactory,
  NewCloneEvent,
} from "../../../typechain/contracts/factory/CloneFactory";
import { Lobby } from "../../../typechain/contracts/lobby/Lobby";
import {
  Stake,
  StakeConfigStruct,
} from "../../../typechain/contracts/stake/Stake";
import {
  assertError,
  generateEvaluableConfig,
  getEventArgs,
  max_uint256,
  memoryOperand,
  MemoryType,
  op,
  RainterpreterOps,
  stakeImplementation,
} from "../../../utils";

import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import { flowCloneFactory } from "../../../utils/deploy/factory/cloneFactory";
import { deployLobby } from "../../../utils/deploy/lobby/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";

describe("CloneFactory tests", async function () {
  const Opcode = RainterpreterOps;

  let cloneFactory: CloneFactory;
  let implementationLobby: Lobby;
  let implementationStake: Stake;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementationLobby = await deployLobby(15000000);
    implementationStake = await stakeImplementation();

    //Deploy Clone Factory
    cloneFactory = await flowCloneFactory();
  });

  it("should revert if implementation address is zero", async () => {
    const token = (await basicDeploy("ReserveToken", {})) as ReserveToken;

    const evaluableConfig0 = await generateEvaluableConfig(
      [
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
      ],
      [max_uint256]
    );

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      evaluableConfig: evaluableConfig0,
    };

    const encodedConfig = ethers.utils.defaultAbiCoder.encode(
      [
        "tuple(address asset ,string name, string symbol , tuple(address deployer,bytes[] sources,uint256[] constants) evaluableConfig)",
      ],
      [stakeConfigStruct]
    );

    await assertError(
      async () =>
        await cloneFactory.clone(ethers.constants.AddressZero, encodedConfig),
      "ZeroImplementation",
      "Deployed with zero implementation"
    );
  });

  it("should not clone contract with incorrect implementation contract ", async () => {
    const token = (await basicDeploy("ReserveToken", {})) as ReserveToken;

    const evaluableConfig0 = await generateEvaluableConfig(
      [
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
      ],
      [max_uint256]
    );

    const stakeConfigStruct0: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      evaluableConfig: evaluableConfig0,
    };

    const encodedConfig0 = ethers.utils.defaultAbiCoder.encode(
      [
        "tuple(address asset ,string name, string symbol , tuple(address deployer,bytes[] sources,uint256[] constants) evaluableConfig)",
      ],
      [stakeConfigStruct0]
    );

    assertError(
      async () =>
        await cloneFactory.clone(implementationLobby.address, encodedConfig0),
      "",
      "Deployed with Incorrect implementation"
    );

    const stakeConfigStruct1 = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
    };

    const encodedConfig1 = ethers.utils.defaultAbiCoder.encode(
      ["tuple(address asset ,string name, string symbol)"],
      [stakeConfigStruct1]
    );

    assertError(
      async () =>
        await cloneFactory.clone(implementationLobby.address, encodedConfig1),
      "",
      "Deployed with Incorrect data"
    );
  });

  it("should not clone contract with incorrect  data ", async () => {
    const token = (await basicDeploy("ReserveToken", {})) as ReserveToken;

    const stakeConfigStruct0 = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
    };

    const encodedConfig1 = ethers.utils.defaultAbiCoder.encode(
      ["tuple(address asset ,string name, string symbol)"],
      [stakeConfigStruct0]
    );

    assertError(
      async () =>
        await cloneFactory.clone(implementationStake.address, encodedConfig1),
      "",
      "Deployed with Incorrect data"
    );

    assertError(
      async () => await cloneFactory.clone(implementationStake.address, "0x00"),
      "",
      "Deployed with zero data"
    );
  });

  it("should initialize clone with correct data", async () => {
    const signers = await ethers.getSigners();

    const token = (await basicDeploy("ReserveToken", {})) as ReserveToken;

    const evaluableConfig = await generateEvaluableConfig(
      [
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
      ],
      [max_uint256]
    );

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
      implementationStake.address,
      encodedConfig
    );

    const cloneEvent = (await getEventArgs(
      stakeClone,
      "NewClone",
      cloneFactory
    )) as NewCloneEvent["args"];

    assert(cloneEvent.sender == signers[0].address, "Incorrect sender");
    assert(
      cloneEvent.implementation == implementationStake.address,
      "Incorrect implementation"
    );
  });
});
