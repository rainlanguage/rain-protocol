import { strict as assert } from "assert";

import { arrayify, concat, solidityKeccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  CloneFactory,
  LobbyReentrantSender,
  ReserveToken18,
} from "../../typechain";

import {
  ContextEvent,
  DepositEvent,
  JoinEvent,
  LeaveEvent,
  Lobby,
  LobbyConfigStruct,
  SignedContextStruct,
} from "../../typechain/contracts/lobby/Lobby";
import { assertError } from "../../utils";
import { ONE } from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import { flowCloneFactory } from "../../utils/deploy/factory/cloneFactory";

import { deployLobby, deployLobbyClone } from "../../utils/deploy/lobby/deploy";
import deploy1820 from "../../utils/deploy/registry1820/deploy";
import { getEventArgs } from "../../utils/events";
import {
  generateEvaluableConfig,
  memoryOperand,
  MemoryType,
  op,
} from "../../utils/interpreter/interpreter";
import { RainterpreterOps } from "../../utils/interpreter/ops/allStandardOps";

describe("Lobby Tests leave", async function () {
  const Opcode = RainterpreterOps;
  let cloneFactory: CloneFactory;

  let tokenA: ReserveToken18;

  const PHASE_PLAYERS_PENDING = ethers.BigNumber.from(1);

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    //Deploy Clone Factory
    cloneFactory = await flowCloneFactory();
  });

  beforeEach(async () => {
    tokenA = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await tokenA.initialize();
  });

  it("should ensure player is refunded on leave (interpreter amount > deposit amount)", async function () {
    const signers = await ethers.getSigners();
    const [, alice] = signers;

    await tokenA.connect(signers[0]).transfer(alice.address, ONE.mul(100));

    const lobbyImplementation: Lobby = await deployLobby(15000000);

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
            op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 0)) ,

              op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 4)) ,
              op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 3)) ,
             op(Opcode.erc_20_balance_of)  ,
             op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 2)) ,
            op(Opcode.div, 2),

             op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3)), // key
             op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 1)), // val
            op(Opcode.set),

        ]);

    const leaveSource = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3)),
      op(Opcode.get),
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)),
      op(Opcode.add, 2),
    ]);
    const claimSource = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)),
    ]);
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
      description: [],
      timeoutDuration: 15000000,
    };

    const Lobby = await deployLobbyClone(
      signers[0],
      cloneFactory,
      lobbyImplementation,
      initialConfig
    );
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
    const [, alice] = signers;

    await tokenA.connect(signers[0]).transfer(alice.address, ONE.mul(100));

    const lobbyImplementation: Lobby = await deployLobby(15000000);

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
            op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 0)) ,

              op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 4)) ,
              op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 3)) ,
             op(Opcode.erc_20_balance_of)  ,
             op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 2)) ,
            op(Opcode.div, 2),

             op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3)), // key
             op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 1)), // val
            op(Opcode.set),

        ]);

    const leaveSource = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3)),
      op(Opcode.get),
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)),
      op(Opcode.sub, 2),
    ]);
    const claimSource = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)),
    ]);
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
      description: [],
      timeoutDuration: 15000000,
    };

    const Lobby = await deployLobbyClone(
      signers[0],
      cloneFactory,
      lobbyImplementation,
      initialConfig
    );
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
    const [, alice, bob] = signers;

    await tokenA.connect(signers[0]).transfer(alice.address, ONE.mul(100));

    const lobbyImplementation: Lobby = await deployLobby(15000000);

    const truthyValue = 0;
    const depositAmount = ONE;
    const leaveAmount = ONE;
    const claimAmount = ONE;

    const constants = [truthyValue, depositAmount, leaveAmount, claimAmount];

    // prettier-ignore
    const joinSource = concat([
            op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 0)) ,
            op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 1))
        ]);

    const leaveSource = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)),
    ]);
    const claimSource = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3)),
    ]);
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
      description: [],
      timeoutDuration: 15000000,
    };

    const Lobby = await deployLobbyClone(
      signers[0],
      cloneFactory,
      lobbyImplementation,
      initialConfig
    );
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
    const [, alice] = signers;

    await tokenA.connect(signers[0]).transfer(alice.address, ONE.mul(100));

    const lobbyImplementation: Lobby = await deployLobby(15000000);

    const truthyValue = 0;
    const depositAmount = ONE;
    const leaveAmount = ONE;
    const claimAmount = ONE;

    const constants = [truthyValue, depositAmount, leaveAmount, claimAmount];

    // prettier-ignore
    const joinSource = concat([
            op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 0)) ,
            op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 1))
        ]);

    const leaveSource = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)),
    ]);
    const claimSource = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3)),
    ]);
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
      description: [],
      timeoutDuration: 15000000,
    };

    const Lobby = await deployLobbyClone(
      signers[0],
      cloneFactory,
      lobbyImplementation,
      initialConfig
    );
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

  it("should validate context emitted in Context event", async function () {
    const signers = await ethers.getSigners();
    const [, alice] = signers;

    await tokenA.connect(signers[0]).transfer(alice.address, ONE.mul(100));

    const lobbyImplementation: Lobby = await deployLobby(15000000);

    const truthyValue = 0;
    const depositAmount = ONE;
    const leaveAmount = ONE;
    const claimAmount = ONE;

    const constants = [truthyValue, depositAmount, leaveAmount, claimAmount];

    // prettier-ignore
    const joinSource = concat([
            op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 0)) ,
            op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 1))
        ]);

    const leaveSource = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)),
    ]);
    const claimSource = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3)),
    ]);
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
      description: [],
      timeoutDuration: 15000000,
    };

    const Lobby = await deployLobbyClone(
      signers[0],
      cloneFactory,
      lobbyImplementation,
      initialConfig
    );
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

    // Checking Context
    const expectedContext0 = [
      [
        ethers.BigNumber.from(alice.address),
        ethers.BigNumber.from(Lobby.address),
      ],
      [ethers.BigNumber.from(1234)],
      [ethers.BigNumber.from(alice.address)],
      [
        ethers.BigNumber.from(1),
        ethers.BigNumber.from(2),
        ethers.BigNumber.from(3),
      ],
    ];

    const { sender: sender0_, context: context0_ } = (await getEventArgs(
      leaveTx,
      "Context",
      Lobby
    )) as ContextEvent["args"];

    assert(sender0_ === alice.address, "wrong sender");
    for (let i = 0; i < expectedContext0.length; i++) {
      const rowArray = expectedContext0[i];
      for (let j = 0; j < rowArray.length; j++) {
        const colElement = rowArray[j];
        if (!context0_[i][j].eq(colElement)) {
          assert.fail(`mismatch at position (${i},${j}),
                       expected  ${colElement}
                       got       ${context0_[i][j]}`);
        }
      }
    }
  });

  it("should ensure leave isn't reentrant", async function () {
    const signers = await ethers.getSigners();
    const [, alice] = signers;

    const maliciousReserveFactory = await ethers.getContractFactory(
      "LobbyReentrantSender"
    );
    const maliciousReserve =
      (await maliciousReserveFactory.deploy()) as LobbyReentrantSender;
    await maliciousReserve.deployed();
    await maliciousReserve.initialize();

    await maliciousReserve
      .connect(signers[0])
      .transfer(alice.address, ONE.mul(100));

    const lobbyImplementation: Lobby = await deployLobby(15000000);

    const truthyValue = 0;
    const depositAmount = ONE;
    const leaveAmount = ONE;
    const claimAmount = ONE;

    const constants = [truthyValue, depositAmount, leaveAmount, claimAmount];

    // prettier-ignore
    const joinSource = concat([
            op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 0)) ,
            op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 1))
        ]);

    const leaveSource = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)),
    ]);
    const claimSource = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3)),
    ]);
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
      token: maliciousReserve.address,
      description: [],
      timeoutDuration: 15000000,
    };

    const Lobby = await deployLobbyClone(
      signers[0],
      cloneFactory,
      lobbyImplementation,
      initialConfig
    );
    await maliciousReserve.connect(alice).approve(Lobby.address, ONE.mul(100));

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

    await Lobby.connect(alice).join([1234], signedContexts0);

    await maliciousReserve.addReentrantTarget(
      Lobby.address,
      [1234],
      signedContexts0
    );

    await assertError(
      async () => await Lobby.connect(alice).leave([1234], signedContexts0),
      "VM Exception while processing transaction: reverted with reason string 'ReentrancyGuard: reentrant call'",
      "Leave Reentrant"
    );
  });
});
