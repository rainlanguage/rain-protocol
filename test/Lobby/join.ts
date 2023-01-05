import { assert } from "chai";
import { arrayify, concat, solidityKeccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  Rainterpreter,
  RainterpreterExpressionDeployer,
  ReserveToken18,
} from "../../typechain";
import {
  DepositEvent,
  JoinEvent,
  LobbyConfigStruct,
  SignedContextStruct,
} from "../../typechain/contracts/lobby/Lobby";
import { assertError } from "../../utils";
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

describe("Lobby Tests join", async function () {
  const Opcode = RainterpreterOps;

  let tokenA: ReserveToken18;
  let interpreter: Rainterpreter;
  let expressionDeployer: RainterpreterExpressionDeployer;

  const PHASE_PLAYERS_PENDING = ethers.BigNumber.from(1);
  const PHASE_RESULT_PENDING = ethers.BigNumber.from(2);

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

  it("should ensure no more players are able to join after players are finalized", async function () {
    const signers = await ethers.getSigners();
    const alice = signers[1];
    const bob = signers[2]; 

    const depositAmount = ONE
    const leaveAmount = ONE
    const claimAmount = ONE
    const timeoutDuration = 15000000


    await tokenA.connect(signers[0]).transfer(alice.address, depositAmount);
    await tokenA.connect(signers[0]).transfer(bob.address, depositAmount);

    const Lobby = await basicDeploy("Lobby", {}, [timeoutDuration]);

    const constants = [0, depositAmount, leaveAmount, claimAmount];

    // prettier-ignore
    const joinSource = concat([
        op(Opcode.CONTEXT, 0x0300),  
        op(Opcode.READ_MEMORY,memoryOperand(MemoryType.Constant, 1))
      ]);

    const leaveSource = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)),
    ]);
    const claimSource = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)),
    ]);
    const invalidSource = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
    ]);

    const lobbyStateConfig = {
      sources: [joinSource, leaveSource, claimSource, invalidSource],
      constants: constants,
    };

    const initialConfig: LobbyConfigStruct = {
      refMustAgree: false,
      ref: signers[0].address,
      expressionDeployer: expressionDeployer.address,
      interpreter: interpreter.address,
      token: tokenA.address,
      stateConfig: lobbyStateConfig,
      description: [],
      timeoutDuration: timeoutDuration,
    };

    await Lobby.initialize(initialConfig);

    await tokenA.connect(alice).approve(Lobby.address, depositAmount);
    await tokenA.connect(bob).approve(Lobby.address, depositAmount);

    const context0 = [10, 11, 12];
    const hash0 = solidityKeccak256(["uint256[]"], [context0]);
    const goodSignature0 = await alice.signMessage(arrayify(hash0));

    const signedContexts0: SignedContextStruct[] = [
      {
        signer: alice.address,
        signature: goodSignature0,
        context: context0,
      },
    ];

    const joinTx = await Lobby.connect(alice).join([1234], signedContexts0);

    const { sender } = (await getEventArgs(
      joinTx,
      "Join",
      Lobby
    )) as JoinEvent["args"];

    assert(sender === alice.address, "wrong sender");
    const currentPhase = await Lobby.currentPhase();
    assert(currentPhase.eq(PHASE_RESULT_PENDING), "Bad Phase");

    // Bob Joins after Players are finalized
    const context1 = [4, 5, 6];
    const hash1 = solidityKeccak256(["uint256[]"], [context1]);
    const goodSignature1 = await bob.signMessage(arrayify(hash1));

    const signedContexts1: SignedContextStruct[] = [
      {
        signer: bob.address,
        signature: goodSignature1,
        context: context1,
      },
    ];

    await assertError(
      async () => await Lobby.connect(bob).join([4567], signedContexts1),
      "VM Exception while processing transaction: reverted with custom error 'BadPhase()",
      "did not revert when user tired joined after PHASE_RESULT_PENDING phase"
    );
  });

  it("should ensure non-players are able to join and refs not able to join", async function () {
    const signers = await ethers.getSigners();
    const ref = signers[0];
    const alice = signers[1]; 

    const depositAmount = ONE
    const leaveAmount = ONE
    const claimAmount = ONE
    const timeoutDuration = 15000000

    await tokenA.connect(signers[0]).transfer(alice.address, depositAmount);

    const Lobby = await basicDeploy("Lobby", {}, [timeoutDuration]);

    const constants = [0, depositAmount, leaveAmount, claimAmount];

    // prettier-ignore
    const joinSource = concat([
        op(Opcode.READ_MEMORY,memoryOperand(MemoryType.Constant, 0)) ,
        op(Opcode.READ_MEMORY,memoryOperand(MemoryType.Constant, 1))
      ]);

    const leaveSource = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)),
    ]);
    const claimSource = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)),
    ]);
    const invalidSource = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
    ]);

    const lobbyStateConfig = {
      sources: [joinSource, leaveSource, claimSource, invalidSource],
      constants: constants,
    };

    const initialConfig: LobbyConfigStruct = {
      refMustAgree: false,
      ref: signers[0].address,
      expressionDeployer: expressionDeployer.address,
      interpreter: interpreter.address,
      token: tokenA.address,
      stateConfig: lobbyStateConfig,
      description: [],
      timeoutDuration: timeoutDuration,
    };

    await Lobby.initialize(initialConfig);

    await tokenA.connect(alice).approve(Lobby.address, depositAmount);

    const context0 = [1, 2, 3];
    const hash0 = solidityKeccak256(["uint256[]"], [context0]);
    const goodSignature0 = await alice.signMessage(arrayify(hash0));

    const signedContexts0: SignedContextStruct[] = [
      {
        signer: alice.address,
        signature: goodSignature0,
        context: context0,
      },
    ];

    const joinTx = await Lobby.connect(alice).join([1234], signedContexts0);

    const { sender } = (await getEventArgs(
      joinTx,
      "Join",
      Lobby
    )) as JoinEvent["args"];

    const {
      sender: depositSender,
      token: depositToken,
      amount,
    } = (await getEventArgs(joinTx, "Deposit", Lobby)) as DepositEvent["args"];

    assert(depositSender === alice.address, "wrong deposit sender");
    assert(depositToken === tokenA.address, "wrong deposit token");
    assert(amount.eq(depositAmount), "wrong deposit amount");
    assert(sender === alice.address, "wrong sender");

    const currentPhase = await Lobby.currentPhase();
    assert(currentPhase.eq(PHASE_PLAYERS_PENDING), "Bad Phase");

    const context1 = [4, 5, 6];
    const hash1 = solidityKeccak256(["uint256[]"], [context1]);
    const goodSignature1 = await ref.signMessage(arrayify(hash1));

    const signedContexts1: SignedContextStruct[] = [
      {
        signer: ref.address,
        signature: goodSignature1,
        context: context1,
      },
    ];

    await assertError(
      async () => await Lobby.connect(alice).join([1234], signedContexts0),
      "VM Exception while processing transaction: reverted with reason string 'ONLY_NON_PLAYER'",
      "did not revert on non-player 'join'"
    );

    await assertError(
      async () => await Lobby.connect(ref).join([1234], signedContexts1),
      "VM Exception while processing transaction: reverted with reason string 'ONLY_NON_REF'",
      "did not revert on ref 'join'"
    );
  });

  it("should ensure player joins lobby on happy path ", async function () {
    const signers = await ethers.getSigners();
    const alice = signers[1];
    const bob = signers[2]; 

    const depositAmount = ONE
    const leaveAmount = ONE
    const claimAmount = ONE
    const timeoutDuration = 15000000

    await tokenA.connect(signers[0]).transfer(alice.address, depositAmount);

    const Lobby = await basicDeploy("Lobby", {}, [timeoutDuration]);

    const constants = [1, depositAmount, leaveAmount, claimAmount];

    // prettier-ignore
    const joinSource = concat([
        op(Opcode.READ_MEMORY,memoryOperand(MemoryType.Constant, 0)) ,
        op(Opcode.READ_MEMORY,memoryOperand(MemoryType.Constant, 1))
      ]);

    const leaveSource = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)),
    ]);
    const claimSource = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)),
    ]);
    const invalidSource = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
    ]);

    const lobbyStateConfig = {
      sources: [joinSource, leaveSource, claimSource, invalidSource],
      constants: constants,
    };

    const initialConfig: LobbyConfigStruct = {
      refMustAgree: false,
      ref: signers[0].address,
      expressionDeployer: expressionDeployer.address,
      interpreter: interpreter.address,
      token: tokenA.address,
      stateConfig: lobbyStateConfig,
      description: [],
      timeoutDuration: timeoutDuration,
    };

    await Lobby.initialize(initialConfig);

    await tokenA.connect(alice).approve(Lobby.address, depositAmount);

    const context0 = [1, 2, 3];
    const hash0 = solidityKeccak256(["uint256[]"], [context0]);
    const goodSignature0 = await alice.signMessage(arrayify(hash0));

    const context1 = [4, 5, 6];
    const hash1 = solidityKeccak256(["uint256[]"], [context1]);
    const goodSignature1 = await bob.signMessage(arrayify(hash1));

    const signedContexts0: SignedContextStruct[] = [
      {
        signer: alice.address,
        signature: goodSignature0,
        context: context0,
      },
      {
        signer: bob.address,
        signature: goodSignature1,
        context: context1,
      },
    ];

    const joinTx = await Lobby.connect(alice).join([1234], signedContexts0);

    const { sender } = (await getEventArgs(
      joinTx,
      "Join",
      Lobby
    )) as JoinEvent["args"];

    const {
      sender: depositSender,
      token: depositToken,
      amount,
    } = (await getEventArgs(joinTx, "Deposit", Lobby)) as DepositEvent["args"];

    assert(depositSender === alice.address, "wrong deposit sender");
    assert(depositToken === tokenA.address, "wrong deposit token");
    assert(amount.eq(depositAmount), "wrong deposit amount");
    assert(sender === alice.address, "wrong sender");

    const currentPhase = await Lobby.currentPhase();
    assert(currentPhase.eq(PHASE_RESULT_PENDING), "Bad Phase");
  });
});
