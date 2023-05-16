import { strict as assert } from "assert";

import { arrayify, concat, solidityKeccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  CloneFactory,
  LobbyReentrantReceiver,
  ReserveToken18,
} from "../../typechain";

import {
  ContextEvent,
  DepositEvent,
  JoinEvent,
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

describe("Lobby Tests join", async function () {
  const Opcode = RainterpreterOps;
  let cloneFactory: CloneFactory;
  let tokenA: ReserveToken18;

  const PHASE_PLAYERS_PENDING = ethers.BigNumber.from(1);
  const PHASE_RESULT_PENDING = ethers.BigNumber.from(2);

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

  it("should ensure no more players are able to join after players are finalized", async function () {
    const signers = await ethers.getSigners();
    const [, alice, bob] = signers;

    const depositAmount = ONE;
    const leaveAmount = ONE;
    const claimAmount = ONE;
    const timeoutDuration = 15000000;

    await tokenA.connect(signers[0]).transfer(alice.address, depositAmount);
    await tokenA.connect(signers[0]).transfer(bob.address, depositAmount);

    const lobbyImplementation: Lobby = await deployLobby(timeoutDuration);

    const constants = [0, depositAmount, leaveAmount, claimAmount];

    // prettier-ignore
    const joinSource = concat([
        op(Opcode.context, 0x0300),
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
      timeoutDuration: timeoutDuration,
    };

    const Lobby = await deployLobbyClone(
      signers[0],
      cloneFactory,
      lobbyImplementation,
      initialConfig
    );

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
    const [ref, alice] = signers;

    const depositAmount = ONE;
    const leaveAmount = ONE;
    const claimAmount = ONE;
    const timeoutDuration = 15000000;

    await tokenA.connect(signers[0]).transfer(alice.address, depositAmount);

    const lobbyImplementation: Lobby = await deployLobby(timeoutDuration);

    const constants = [0, depositAmount, leaveAmount, claimAmount];

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
      timeoutDuration: timeoutDuration,
    };

    const Lobby = await deployLobbyClone(
      signers[0],
      cloneFactory,
      lobbyImplementation,
      initialConfig
    );

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

  it("should ensure players are not able to join lobby until ref allows to agree", async function () {
    const signers = await ethers.getSigners();
    const [, alice, bob] = signers;

    const depositAmount = ONE;
    const leaveAmount = ONE;
    const claimAmount = ONE;
    const timeoutDuration = 15000000;

    await tokenA.connect(signers[0]).transfer(alice.address, depositAmount);

    const lobbyImplementation: Lobby = await deployLobby(timeoutDuration);

    const constants = [1, depositAmount, leaveAmount, claimAmount];

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
      refMustAgree: true,
      ref: signers[0].address,
      evaluableConfig: evaluableConfig,
      token: tokenA.address,
      description: [],
      timeoutDuration: timeoutDuration,
    };

    const Lobby = await deployLobbyClone(
      signers[0],
      cloneFactory,
      lobbyImplementation,
      initialConfig
    );

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

    //Player tries to join before ref agrees
    await assertError(
      async () => await Lobby.connect(alice).join([1234], signedContexts0),
      "BadPhase",
      "Intialized before ref agrees"
    );

    await Lobby.connect(signers[0]).refAgrees();

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

  it("should ensure player joins lobby on happy path ", async function () {
    const signers = await ethers.getSigners();
    const [, alice, bob] = signers;

    const depositAmount = ONE;
    const leaveAmount = ONE;
    const claimAmount = ONE;
    const timeoutDuration = 15000000;

    await tokenA.connect(signers[0]).transfer(alice.address, depositAmount);

    const lobbyImplementation: Lobby = await deployLobby(timeoutDuration);

    const constants = [1, depositAmount, leaveAmount, claimAmount];

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
      timeoutDuration: timeoutDuration,
    };

    const Lobby = await deployLobbyClone(
      signers[0],
      cloneFactory,
      lobbyImplementation,
      initialConfig
    );

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

  it("should validate context emitted in Context Event", async function () {
    const signers = await ethers.getSigners();
    const [, alice, bob] = signers;

    const depositAmount = ONE;
    const leaveAmount = ONE;
    const claimAmount = ONE;
    const timeoutDuration = 15000000;

    await tokenA.connect(signers[0]).transfer(alice.address, depositAmount);

    const lobbyImplementation: Lobby = await deployLobby(timeoutDuration);

    const constants = [1, depositAmount, leaveAmount, claimAmount];

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
      timeoutDuration: timeoutDuration,
    };

    const Lobby = await deployLobbyClone(
      signers[0],
      cloneFactory,
      lobbyImplementation,
      initialConfig
    );

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

    const expectedContext0 = [
      [
        ethers.BigNumber.from(alice.address),
        ethers.BigNumber.from(Lobby.address),
      ],
      [ethers.BigNumber.from(1234)],
      [
        ethers.BigNumber.from(alice.address),
        ethers.BigNumber.from(bob.address),
      ],
      [
        ethers.BigNumber.from(1),
        ethers.BigNumber.from(2),
        ethers.BigNumber.from(3),
      ],
      [
        ethers.BigNumber.from(4),
        ethers.BigNumber.from(5),
        ethers.BigNumber.from(6),
      ],
    ];

    const { sender: sender0, context: context0_ } = (await getEventArgs(
      joinTx,
      "Context",
      Lobby
    )) as ContextEvent["args"];

    assert(sender0 === alice.address, "wrong sender");
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

  it("should ensure that join isn't reentrant", async function () {
    const signers = await ethers.getSigners();
    const [, alice, bob] = signers;

    const depositAmount = ONE;
    const leaveAmount = ONE;
    const claimAmount = ONE;
    const timeoutDuration = 15000000;

    const maliciousTokenFactory = await ethers.getContractFactory(
      "LobbyReentrantReceiver"
    );
    const maliciousToken =
      (await maliciousTokenFactory.deploy()) as LobbyReentrantReceiver;
    await maliciousToken.deployed();
    await maliciousToken.initialize();

    await maliciousToken
      .connect(signers[0])
      .transfer(alice.address, depositAmount);

    const lobbyImplementation: Lobby = await deployLobby(timeoutDuration);

    const constants = [0, depositAmount, leaveAmount, claimAmount];

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
      token: maliciousToken.address,
      description: [],
      timeoutDuration: timeoutDuration,
    };

    const Lobby = await deployLobbyClone(
      signers[0],
      cloneFactory,
      lobbyImplementation,
      initialConfig
    );

    await maliciousToken.connect(alice).approve(Lobby.address, depositAmount);

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

    await maliciousToken.addReentrantTarget(
      Lobby.address,
      [1234],
      signedContexts0
    );

    await assertError(
      async () => await Lobby.connect(alice).join([1234], signedContexts0),
      "VM Exception while processing transaction: reverted with reason string 'ReentrancyGuard: reentrant call'",
      "Join Reentrant"
    );
  });
});
