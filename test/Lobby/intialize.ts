import { assert } from "chai";

import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { CloneFactory, ReserveToken18 } from "../../typechain";
import { NewCloneEvent } from "../../typechain/contracts/factory/CloneFactory";
import {
  InitializeEvent,
  Lobby,
  LobbyConfigStruct,
} from "../../typechain/contracts/lobby/Lobby";
import { compareStructs } from "../../utils";
import { ONE } from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import { deployLobby } from "../../utils/deploy/lobby/deploy";
import deploy1820 from "../../utils/deploy/registry1820/deploy";
import { getEventArgs } from "../../utils/events";
import {
  generateEvaluableConfig,
  memoryOperand,
  MemoryType,
  op,
} from "../../utils/interpreter/interpreter";
import { RainterpreterOps } from "../../utils/interpreter/ops/allStandardOps";

describe("Lobby Tests Intialize", async function () {
  const Opcode = RainterpreterOps;
  let cloneFactory: CloneFactory;

  let tokenA: ReserveToken18;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    //Deploy Clone Factory
    cloneFactory = (await basicDeploy("CloneFactory", {})) as CloneFactory;
  });

  beforeEach(async () => {
    tokenA = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await tokenA.initialize();
  });

  it("Lobby is intialized correctly", async function () {
    const signers = await ethers.getSigners();

    const timeoutDuration = 15000000;
    const lobbyImplementation: Lobby = await deployLobby(timeoutDuration);

    const constants = [0, 1, ONE];

    // prettier-ignore
    const joinSource = concat([
        op(Opcode.context, 0x0300) ,
        op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 2))
      ]);

    const leaveSource = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)),
    ]);
    const claimSource = concat([op(Opcode.context, 0x0100)]);

    const invalidSource = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
    ]);

    const lobbyExpressionConfig = {
      sources: [joinSource, leaveSource, claimSource, invalidSource],
      constants: constants,
    };

    const evaluableConfig = await generateEvaluableConfig(
      lobbyExpressionConfig.sources,
      lobbyExpressionConfig.constants
    );

    const initialConfig: LobbyConfigStruct = {
      refMustAgree: false,
      ref: signers[0].address,
      evaluableConfig: evaluableConfig,
      token: tokenA.address,
      description: "0x00",
      timeoutDuration: timeoutDuration,
    };

    const encodedConfig = ethers.utils.defaultAbiCoder.encode(
      [
        "tuple(bool refMustAgree ,address ref,address token,tuple(address deployer,bytes[] sources,uint256[] constants) evaluableConfig, bytes description , uint256 timeoutDuration)",
      ],
      [initialConfig]
    );

    const lobbyClone = await cloneFactory.clone(
      lobbyImplementation.address,
      encodedConfig
    );

    const cloneEvent = (await getEventArgs(
      lobbyClone,
      "NewClone",
      cloneFactory
    )) as NewCloneEvent["args"];

    const Lobby_ = (await ethers.getContractAt(
      "Lobby",
      cloneEvent.clone
    )) as Lobby;

    const intializeEvent = (await getEventArgs(
      lobbyClone,
      "Initialize",
      Lobby_
    )) as InitializeEvent["args"];

    assert(
      intializeEvent.sender === cloneFactory.address,
      "wrong deposit sender"
    );
    compareStructs(intializeEvent.config, initialConfig);
  });
});
