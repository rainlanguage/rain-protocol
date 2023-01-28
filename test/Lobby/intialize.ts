import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  Rainterpreter,
  RainterpreterExpressionDeployer,
  ReserveToken18,
} from "../../typechain";
import {
  InitializeEvent,
  LobbyConfigStruct,
} from "../../typechain/contracts/lobby/Lobby";
import { compareStructs } from "../../utils";
import { ONE } from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import { rainterpreterDeploy } from "../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployerDeploy } from "../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import { getEventArgs } from "../../utils/events";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../utils/interpreter/interpreter";
import { RainterpreterOps } from "../../utils/interpreter/ops/allStandardOps";

describe("Lobby Tests Intialize", async function () {
  const Opcode = RainterpreterOps;

  let tokenA: ReserveToken18;
  let interpreter: Rainterpreter;
  let expressionDeployer: RainterpreterExpressionDeployer;

  before(async () => {
    interpreter = await rainterpreterDeploy();
    expressionDeployer = await rainterpreterExpressionDeployerDeploy(
      interpreter
    );
  });

  beforeEach(async () => {
    tokenA = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await tokenA.initialize();
  });

  it("Lobby is intialized correctly", async function () {
    const signers = await ethers.getSigners();

    const timeoutDuration = 15000000;
    const Lobby = await basicDeploy("Lobby", {}, [timeoutDuration]);

    const constants = [0, 1, ONE];

    // prettier-ignore
    const joinSource = concat([
        op(Opcode.CONTEXT, 0x0300) ,
        op(Opcode.READ_MEMORY,memoryOperand(MemoryType.Constant, 2))
      ]);

    const leaveSource = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)),
    ]);
    const claimSource = concat([op(Opcode.CONTEXT, 0x0100)]);

    const invalidSource = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
    ]);

    const lobbyExpressionConfig = {
      sources: [joinSource, leaveSource, claimSource, invalidSource],
      constants: constants,
    };

    const initialConfig: LobbyConfigStruct = {
      refMustAgree: false,
      ref: signers[0].address,
      expressionDeployer: expressionDeployer.address,
      interpreter: interpreter.address,
      token: tokenA.address,
      expressionConfig: lobbyExpressionConfig,
      description: "0x00",
      timeoutDuration: timeoutDuration,
    };

    const intializeTx = await Lobby.initialize(initialConfig);

    const intializeEvent = (await await getEventArgs(
      intializeTx,
      "Initialize",
      Lobby
    )) as InitializeEvent["args"];

    assert(
      intializeEvent.sender === signers[0].address,
      "wrong deposit sender"
    );
    compareStructs(intializeEvent.config, initialConfig);
  });
});
