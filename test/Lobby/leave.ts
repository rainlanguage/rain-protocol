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
  LeaveEvent,
  LobbyConfigStruct,
  SignedContextStruct,
} from "../../typechain/contracts/lobby/Lobby";
import { assertError } from "../../utils";
import {
  ONE,
} from "../../utils/constants/bigNumber";
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

describe("Lobby Tests leave", async function () {
  const Opcode = RainterpreterOps;

  let tokenA: ReserveToken18;
  let interpreter: Rainterpreter;
  let expressionDeployer: RainterpreterExpressionDeployer;

  const PHASE_PLAYERS_PENDING = ethers.BigNumber.from(1);

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

  it("should ensure player is refunded on leave (interpreter amount > deposit amount)", async function () {
    const signers = await ethers.getSigners();
    const alice = signers[1];

    await tokenA.connect(signers[0]).transfer(alice.address, ONE.mul(100));
    const Lobby = await basicDeploy("Lobby", {}, [15000000]);

    const truthyValue = 0;
    const depositAmount = ONE.mul(10);
    const claimAmount = ONE;
    const TEN = 10;

    const constants = [
      truthyValue,
      claimAmount,
      TEN,
      alice.address,
      tokenA.address,
    ];

    // prettier-ignore
    const joinSource = concat([
            op(Opcode.READ_MEMORY,memoryOperand(MemoryType.Constant, 0)) ,  

              op(Opcode.READ_MEMORY,memoryOperand(MemoryType.Constant, 4)) , 
              op(Opcode.READ_MEMORY,memoryOperand(MemoryType.Constant, 3)) , 
             op(Opcode.ERC20_BALANCE_OF)  , 
             op(Opcode.READ_MEMORY,memoryOperand(MemoryType.Constant, 2)) , 
            op(Opcode.DIV, 2),  

             op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)), // key
             op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 1)), // val
            op(Opcode.SET), 
            
        ]);

    const leaveSource = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)),
      op(Opcode.GET),
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)),
      op(Opcode.ADD, 2),
    ]);
    const claimSource = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
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
      timeoutDuration: 15000000,
    };

    await Lobby.initialize(initialConfig);
    await tokenA.connect(alice).approve(Lobby.address, ONE.mul(100));

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

    const { sender: joinSender } = (await getEventArgs(
      joinTx,
      "Join",
      Lobby
    )) as JoinEvent["args"];

    const {
      sender: depositSender,
      token: depositToken,
      amount: depositAmount0,
    } = (await getEventArgs(joinTx, "Deposit", Lobby)) as DepositEvent["args"];

    assert(depositSender === alice.address, "wrong deposit sender");
    assert(depositToken === tokenA.address, "wrong deposit token");
    assert(depositAmount0.eq(depositAmount), "wrong deposit amount");
    assert(joinSender === alice.address, "wrong sender");

    const currentPhase = await Lobby.currentPhase();
    assert(currentPhase.eq(PHASE_PLAYERS_PENDING), "Bad Phase");

    const leaveTx = await Lobby.connect(alice).leave([1234], signedContexts0);

    const {
      sender: leaveSender,
      token: leaveToken,
      deposit: leaveDeposit,
      amount: leaveAmount0,
    } = (await getEventArgs(leaveTx, "Leave", Lobby)) as LeaveEvent["args"];

    assert(leaveSender === alice.address, "wrong deposit sender");
    assert(leaveToken === tokenA.address, "wrong leave token");
    assert(leaveDeposit.eq(depositAmount), "wrong deposit amount");
    assert(leaveAmount0.eq(depositAmount), "wrong leave amount");
  });

  it("should ensure player is refunded on leave (interpreter amount < deposit amount)", async function () {
    const signers = await ethers.getSigners();
    const alice = signers[1];

    await tokenA.connect(signers[0]).transfer(alice.address, ONE.mul(100));
    const Lobby = await basicDeploy("Lobby", {}, [15000000]);

    const truthyValue = 0;
    const depositAmount = ONE.mul(10);
    const claimAmount = ONE;
    const TEN = 10;

    const constants = [
      truthyValue,
      claimAmount,
      TEN,
      alice.address,
      tokenA.address,
    ];

    // prettier-ignore
    const joinSource = concat([
            op(Opcode.READ_MEMORY,memoryOperand(MemoryType.Constant, 0)) ,  

              op(Opcode.READ_MEMORY,memoryOperand(MemoryType.Constant, 4)) , 
              op(Opcode.READ_MEMORY,memoryOperand(MemoryType.Constant, 3)) , 
             op(Opcode.ERC20_BALANCE_OF)  , 
             op(Opcode.READ_MEMORY,memoryOperand(MemoryType.Constant, 2)) , 
            op(Opcode.DIV, 2),  

             op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)), // key
             op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 1)), // val
            op(Opcode.SET), 
            
        ]);

    const leaveSource = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)),
      op(Opcode.GET),
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)),
      op(Opcode.SUB, 2),
    ]);
    const claimSource = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
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
      timeoutDuration: 15000000,
    };

    await Lobby.initialize(initialConfig);
    await tokenA.connect(alice).approve(Lobby.address, ONE.mul(100));

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

    const { sender: joinSender } = (await getEventArgs(
      joinTx,
      "Join",
      Lobby
    )) as JoinEvent["args"];

    const {
      sender: depositSender,
      token: depositToken,
      amount: depositAmount0,
    } = (await getEventArgs(joinTx, "Deposit", Lobby)) as DepositEvent["args"];

    assert(depositSender === alice.address, "wrong deposit sender");
    assert(depositToken === tokenA.address, "wrong deposit token");
    assert(depositAmount0.eq(depositAmount), "wrong deposit amount");
    assert(joinSender === alice.address, "wrong sender");

    const currentPhase = await Lobby.currentPhase();
    assert(currentPhase.eq(PHASE_PLAYERS_PENDING), "Bad Phase");

    const leaveTx = await Lobby.connect(alice).leave([1234], signedContexts0);

    const expectedLeaveAmount = depositAmount.sub(ethers.BigNumber.from(10));

    const {
      sender: leaveSender,
      token: leaveToken,
      deposit: leaveDeposit,
      amount: leaveAmount0,
    } = (await getEventArgs(leaveTx, "Leave", Lobby)) as LeaveEvent["args"];

    assert(leaveSender === alice.address, "wrong deposit sender"); 
    assert(leaveToken === tokenA.address, "wrong leave token");
    assert(leaveDeposit.eq(depositAmount), "wrong deposit amount");
    assert(leaveAmount0.eq(expectedLeaveAmount), "wrong leave amount");
  });

  it("should ensure only players are able to leave", async function () {
    const signers = await ethers.getSigners();
    const alice = signers[1];
    const bob = signers[2];

    await tokenA.connect(signers[0]).transfer(alice.address, ONE.mul(100));
    const Lobby = await basicDeploy("Lobby", {}, [15000000]);

    const truthyValue = 0;
    const depositAmount = ONE;
    const leaveAmount = ONE;
    const claimAmount = ONE;

    const constants = [truthyValue, depositAmount, leaveAmount, claimAmount];

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
      timeoutDuration: 15000000,
    };

    await Lobby.initialize(initialConfig);
    await tokenA.connect(alice).approve(Lobby.address, ONE.mul(100));

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

    const { sender: joinSender } = (await getEventArgs(
      joinTx,
      "Join",
      Lobby
    )) as JoinEvent["args"];

    const {
      sender: depositSender,
      token: depositToken,
      amount: depositAmount0,
    } = (await getEventArgs(joinTx, "Deposit", Lobby)) as DepositEvent["args"];

    assert(depositSender === alice.address, "wrong deposit sender");
    assert(depositToken === tokenA.address, "wrong deposit token");
    assert(depositAmount0.eq(ONE), "wrong deposit amount");
    assert(joinSender === alice.address, "wrong sender");

    const currentPhase = await Lobby.currentPhase();
    assert(currentPhase.eq(PHASE_PLAYERS_PENDING), "Bad Phase");

    // Non-Player tries to leave

    const context1 = [1, 2, 3];
    const hash1 = solidityKeccak256(["uint256[]"], [context1]);
    const goodSignature1 = await alice.signMessage(arrayify(hash1));

    const signedContexts1: SignedContextStruct[] = [
      {
        signer: bob.address,
        signature: goodSignature1,
        context: context1,
      },
    ];

    await assertError(
      async () => await Lobby.connect(bob).leave([4567], signedContexts1),
      "VM Exception while processing transaction: reverted with reason string 'ONLY_PLAYER'",
      "did not revert on non-player 'leave'"
    );
  });

  it("should ensure player is able to leave on a happy path", async function () {
    const signers = await ethers.getSigners();
    const alice = signers[1];

    await tokenA.connect(signers[0]).transfer(alice.address, ONE.mul(100));
    const Lobby = await basicDeploy("Lobby", {}, [15000000]);

    const truthyValue = 0;
    const depositAmount = ONE;
    const leaveAmount = ONE;
    const claimAmount = ONE;

    const constants = [truthyValue, depositAmount, leaveAmount, claimAmount];

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
      timeoutDuration: 15000000,
    };

    await Lobby.initialize(initialConfig);
    await tokenA.connect(alice).approve(Lobby.address, ONE.mul(100));

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

    const { sender: joinSender } = (await getEventArgs(
      joinTx,
      "Join",
      Lobby
    )) as JoinEvent["args"];

    const {
      sender: depositSender,
      token: depositToken,
      amount: depositAmount0,
    } = (await getEventArgs(joinTx, "Deposit", Lobby)) as DepositEvent["args"];

    assert(depositSender === alice.address, "wrong deposit sender");
    assert(depositToken === tokenA.address, "wrong deposit token");
    assert(depositAmount0.eq(ONE), "wrong deposit amount");
    assert(joinSender === alice.address, "wrong sender");

    const currentPhase = await Lobby.currentPhase();
    assert(currentPhase.eq(PHASE_PLAYERS_PENDING), "Bad Phase");

    const leaveTx = await Lobby.connect(alice).leave([1234], signedContexts0);

    const {
      sender: leaveSender,
      token: leaveToken,
      deposit: leaveDeposit,
      amount: leaveAmount0,
    } = (await getEventArgs(leaveTx, "Leave", Lobby)) as LeaveEvent["args"];

    assert(leaveSender === alice.address, "wrong deposit sender");
    assert(leaveToken === tokenA.address, "wrong leave token");
    assert(leaveDeposit.eq(depositAmount), "wrong deposit amount");
    assert(leaveAmount0.eq(depositAmount), "wrong leave amount");
  });
});
