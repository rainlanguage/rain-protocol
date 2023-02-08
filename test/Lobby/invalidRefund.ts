import { assert } from "chai";
import { ContractFactory } from "ethers";
import { arrayify, concat, solidityKeccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { LobbyReentrantSender, ReserveToken18 } from "../../typechain";
import {
  ClaimEvent,
  ContextEvent,
  DepositEvent,
  InvalidEvent,
  JoinEvent,
  Lobby,
  LobbyConfigStruct,
  LobbyConstructorConfigStruct,
  RefundEvent,
  SignedContextStruct,
} from "../../typechain/contracts/lobby/Lobby";
import {
  assertError,
  fixedPointMul,
  getRainContractMetaBytes,
} from "../../utils";
import { ONE, sixteenZeros } from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import { getEventArgs } from "../../utils/events";
import {
  generateEvaluableConfig,
  memoryOperand,
  MemoryType,
  op,
} from "../../utils/interpreter/interpreter";
import { RainterpreterOps } from "../../utils/interpreter/ops/allStandardOps";

describe("Lobby Invalid Refund", async function () {
  const Opcode = RainterpreterOps;
  let lobbyFactory: ContractFactory;
  let tokenA: ReserveToken18;

  const PHASE_RESULT_PENDING = ethers.BigNumber.from(2);
  const PHASE_COMPLETE = ethers.BigNumber.from(3);
  const PHASE_INVALID = ethers.BigNumber.from(4);
  before(async () => {
    lobbyFactory = await ethers.getContractFactory("Lobby", {});
  });

  beforeEach(async () => {
    tokenA = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await tokenA.initialize();
  });

  it("should ensure players are refunded after lobby is invalidated", async function () {
    const timeoutDuration = 15000000;
    const signers = await ethers.getSigners();
    const alice = signers[1];
    const bob = signers[2];
    const bot = signers[3];

    const lobbyConstructorConfig: LobbyConstructorConfigStruct = {
      maxTimeoutDuration: timeoutDuration,
      callerMeta: getRainContractMetaBytes("lobby"),
    };

    const Lobby = (await lobbyFactory.deploy(lobbyConstructorConfig)) as Lobby;

    const depositAmount = ONE;
    const claimAmount = ONE;
    const leaveAmount = ONE;

    await tokenA.connect(signers[0]).transfer(alice.address, depositAmount);
    await tokenA.connect(signers[0]).transfer(bob.address, depositAmount);

    const constants = [0, depositAmount, leaveAmount, claimAmount, bot.address];

    // prettier-ignore
    const joinSource = concat([
        op(Opcode.context, 0x0300) ,
        op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 1)) ,
      ]);

    const leaveSource = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)),
    ]);
    const claimSource = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3)),
    ]);
    const invalidSource = concat([
      op(Opcode.context, 0x0200),
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 4)),
      op(Opcode.equal_to),
    ]);

    const lobbyExpressionConfig = {
      sources: [joinSource, leaveSource, claimSource, invalidSource],
      constants: constants,
    };

    const evaluableConfig = await generateEvaluableConfig(
      lobbyExpressionConfig
    );

    const initialConfig: LobbyConfigStruct = {
      refMustAgree: false,
      ref: signers[0].address,
      evaluableConfig: evaluableConfig,
      token: tokenA.address,
      description: [],
      timeoutDuration: timeoutDuration,
    };

    await Lobby.initialize(initialConfig);

    await tokenA.connect(alice).approve(Lobby.address, depositAmount);
    await tokenA.connect(bob).approve(Lobby.address, depositAmount);

    const context0 = [0, 2, 3];
    const hash0 = solidityKeccak256(["uint256[]"], [context0]);
    const goodSignature0 = await alice.signMessage(arrayify(hash0));

    const signedContexts0: SignedContextStruct[] = [
      {
        signer: alice.address,
        signature: goodSignature0,
        context: context0,
      },
    ];

    const aliceJoinTx = await Lobby.connect(alice).join(
      [1234],
      signedContexts0
    );

    const aliceJoinEvent = (await getEventArgs(
      aliceJoinTx,
      "Join",
      Lobby
    )) as JoinEvent["args"];

    const aliceDepositEvent = (await getEventArgs(
      aliceJoinTx,
      "Deposit",
      Lobby
    )) as DepositEvent["args"];

    assert(aliceDepositEvent.sender === alice.address, "wrong deposit sender");
    assert(aliceDepositEvent.token === tokenA.address, "wrong deposit token");
    assert(aliceDepositEvent.amount.eq(depositAmount), "wrong deposit amount");
    assert(aliceJoinEvent.sender === alice.address, "wrong sender");

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

    const bobJoinTx = await Lobby.connect(bob).join([1234], signedContexts1);

    const bobJoinEvent = (await getEventArgs(
      bobJoinTx,
      "Join",
      Lobby
    )) as JoinEvent["args"];

    const bobDepositEvent = (await getEventArgs(
      bobJoinTx,
      "Deposit",
      Lobby
    )) as DepositEvent["args"];

    assert(bobDepositEvent.sender === bob.address, "wrong deposit sender");
    assert(bobDepositEvent.token === tokenA.address, "wrong deposit token");
    assert(bobDepositEvent.amount.eq(depositAmount), "wrong deposit amount");
    assert(bobJoinEvent.sender === bob.address, "wrong sender");

    const currentPhase0 = await Lobby.currentPhase();
    assert(currentPhase0.eq(PHASE_RESULT_PENDING), "Bad Phase");

    const context2 = [1];
    const hash2 = solidityKeccak256(["uint256[]"], [context2]);
    const goodSignature2 = await bot.signMessage(arrayify(hash2));

    const claimContext = [1234];

    const signedContexts2: SignedContextStruct[] = [
      {
        signer: bot.address,
        signature: goodSignature2,
        context: context2,
      },
    ];

    const aliceInvalidTx = await Lobby.connect(bot).invalid(
      claimContext,
      signedContexts2
    );

    const currentPhase1 = await Lobby.currentPhase();
    assert(currentPhase1.eq(PHASE_INVALID), "Bad Phase");

    const { sender: invalidEventSender } = (await getEventArgs(
      aliceInvalidTx,
      "Invalid",
      Lobby
    )) as InvalidEvent["args"];

    assert(invalidEventSender === bot.address, "wrong 'invalid' sender");

    const aliceRefund = await Lobby.connect(alice).refund();

    const aliceRefundEvent = (await getEventArgs(
      aliceRefund,
      "Refund",
      Lobby
    )) as RefundEvent["args"];
    assert(aliceRefundEvent.sender === alice.address, "wrong refund sender");
    assert(aliceRefundEvent.amount.eq(depositAmount), "wrong amount refund");

    const bobRefund = await Lobby.connect(bob).refund();

    const bobRefundEvent = (await getEventArgs(
      bobRefund,
      "Refund",
      Lobby
    )) as RefundEvent["args"];
    assert(bobRefundEvent.sender === bob.address, "wrong refund sender");
    assert(bobRefundEvent.amount.eq(depositAmount), "wrong amount refund");
  });

  it("should ensure players are not able to invalidate lobby or refund after PHASE_COMPLETE", async function () {
    const signers = await ethers.getSigners();
    const timeoutDuration = 15000000;
    const alice = signers[1];
    const bob = signers[2];
    const bot = signers[3];

    await tokenA.connect(signers[0]).transfer(alice.address, ONE);
    await tokenA.connect(signers[0]).transfer(bob.address, ONE);

    const lobbyConstructorConfig: LobbyConstructorConfigStruct = {
      maxTimeoutDuration: timeoutDuration,
      callerMeta: getRainContractMetaBytes("lobby"),
    };

    const Lobby = (await lobbyFactory.deploy(lobbyConstructorConfig)) as Lobby;

    const depositAmount = ONE;

    const constants = [0, depositAmount];

    // prettier-ignore
    const joinSource = concat([
        op(Opcode.context, 0x0300) ,
        op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 1)) ,
      ]);

    const leaveSource = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)), // leave amount zero
    ]);

    const claimSource = concat([op(Opcode.context, 0x0100)]);

    const invalidSource = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)), // lobby not invalid
    ]);

    const lobbyExpressionConfig = {
      sources: [joinSource, leaveSource, claimSource, invalidSource],
      constants: constants,
    };

    const evaluableConfig = await generateEvaluableConfig(
      lobbyExpressionConfig
    );

    const initialConfig: LobbyConfigStruct = {
      refMustAgree: false,
      ref: signers[0].address,
      evaluableConfig: evaluableConfig,
      token: tokenA.address,
      description: [],
      timeoutDuration: timeoutDuration,
    };

    await Lobby.initialize(initialConfig);

    await tokenA.connect(alice).approve(Lobby.address, ONE);
    await tokenA.connect(bob).approve(Lobby.address, ONE);

    //Alice joins Lobby

    const context0 = [0, 12, 13];
    const hash0 = solidityKeccak256(["uint256[]"], [context0]);
    const goodSignature0 = await alice.signMessage(arrayify(hash0));

    const signedContexts0: SignedContextStruct[] = [
      {
        signer: alice.address,
        signature: goodSignature0,
        context: context0,
      },
    ];

    const aliceJoinTx = await Lobby.connect(alice).join(
      [1234],
      signedContexts0
    );

    const aliceDepositEvent = (await getEventArgs(
      aliceJoinTx,
      "Deposit",
      Lobby
    )) as DepositEvent["args"];

    assert(aliceDepositEvent.sender === alice.address, "wrong deposit sender");
    assert(aliceDepositEvent.amount.eq(ONE), "wrong deposit amount");

    // Bob Joins lobby
    const context1 = [14, 15, 16]; // context to finalize players
    const hash1 = solidityKeccak256(["uint256[]"], [context1]);
    const goodSignature1 = await bob.signMessage(arrayify(hash1));
    const signedContexts1: SignedContextStruct[] = [
      {
        signer: bob.address,
        signature: goodSignature1,
        context: context1,
      },
    ];

    const bobJoinTx = await Lobby.connect(bob).join([4567], signedContexts1);

    const bobDepositEvent = (await getEventArgs(
      bobJoinTx,
      "Deposit",
      Lobby
    )) as DepositEvent["args"];

    assert(bobDepositEvent.sender === bob.address, "wrong deposit sender");
    assert(bobDepositEvent.amount.eq(ONE), "wrong deposit amount");

    // Checking Phase
    const currentPhase0 = await Lobby.currentPhase();
    assert(currentPhase0.eq(PHASE_RESULT_PENDING), "Bad Phase");

    // Asserting Claim Amounts and Context

    //Both computed amounts add up to 1e18
    const aliceShares = ethers.BigNumber.from(80 + sixteenZeros);
    const bobShares = ethers.BigNumber.from(20 + sixteenZeros);

    //Signed Context by bot address
    const context2 = [aliceShares, bobShares];
    const hash2 = solidityKeccak256(["uint256[]"], [context2]);
    const goodSignature2 = await bot.signMessage(arrayify(hash2));

    const signedContexts2: SignedContextStruct[] = [
      {
        signer: bot.address,
        signature: goodSignature2,
        context: context2,
      },
    ];

    // Alice Claims Amount
    const aliceClaimTx = await Lobby.connect(alice).claim(
      [aliceShares],
      signedContexts2
    );

    const expectedClaimAlice = fixedPointMul(depositAmount.mul(2), aliceShares);

    const aliceClaimEvent = (await getEventArgs(
      aliceClaimTx,
      "Claim",
      Lobby
    )) as ClaimEvent["args"];

    assert(aliceClaimEvent.sender === alice.address, "wrong deposit sender");
    assert(aliceClaimEvent.share.eq(aliceShares), "wrong shares");
    assert(aliceClaimEvent.amount.eq(expectedClaimAlice), "wrong claim amount");

    // Checking Phase
    const currentPhase1 = await Lobby.currentPhase();
    assert(currentPhase1.eq(PHASE_COMPLETE), "Bad Phase");

    // Invalid Tx
    const context3 = [1];
    const hash3 = solidityKeccak256(["uint256[]"], [context3]);
    const goodSignature3 = await bot.signMessage(arrayify(hash3));

    const claimContext = [1234];

    const signedContexts3: SignedContextStruct[] = [
      {
        signer: bot.address,
        signature: goodSignature3,
        context: context3,
      },
    ];

    await assertError(
      async () =>
        await Lobby.connect(bot).invalid(claimContext, signedContexts3),
      "VM Exception while processing transaction: reverted with custom error 'BadPhase()",
      "did not revert when player 'invalid' after PHASE_COMPLATE phase"
    );

    await assertError(
      async () => await Lobby.connect(alice).refund(),
      "VM Exception while processing transaction: reverted with custom error 'BadPhase()",
      "did not revert when player refund after PHASE_COMPLATE phase"
    );

    await assertError(
      async () => await Lobby.connect(bob).refund(),
      "VM Exception while processing transaction: reverted with custom error 'BadPhase()",
      "did not revert when player refund after PHASE_COMPLATE phase"
    );
  });

  it("should validate Context emitted in Context event", async function () {
    const timeoutDuration = 15000000;
    const signers = await ethers.getSigners();
    const alice = signers[1];
    const bob = signers[2];
    const bot = signers[3];

    const lobbyConstructorConfig: LobbyConstructorConfigStruct = {
      maxTimeoutDuration: timeoutDuration,
      callerMeta: getRainContractMetaBytes("lobby"),
    };

    const Lobby = (await lobbyFactory.deploy(lobbyConstructorConfig)) as Lobby;

    const depositAmount = ONE;
    const claimAmount = ONE;
    const leaveAmount = ONE;

    await tokenA.connect(signers[0]).transfer(alice.address, depositAmount);
    await tokenA.connect(signers[0]).transfer(bob.address, depositAmount);

    const constants = [0, depositAmount, leaveAmount, claimAmount, bot.address];

    // prettier-ignore
    const joinSource = concat([
        op(Opcode.context, 0x0300) ,
        op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 1)) ,
      ]);

    const leaveSource = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)),
    ]);
    const claimSource = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3)),
    ]);
    const invalidSource = concat([
      op(Opcode.context, 0x0200),
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 4)),
      op(Opcode.equal_to),
    ]);

    const lobbyExpressionConfig = {
      sources: [joinSource, leaveSource, claimSource, invalidSource],
      constants: constants,
    };

    const evaluableConfig = await generateEvaluableConfig(
      lobbyExpressionConfig
    );

    const initialConfig: LobbyConfigStruct = {
      refMustAgree: false,
      ref: signers[0].address,
      evaluableConfig: evaluableConfig,
      token: tokenA.address,
      description: [],
      timeoutDuration: timeoutDuration,
    };

    await Lobby.initialize(initialConfig);

    await tokenA.connect(alice).approve(Lobby.address, depositAmount);
    await tokenA.connect(bob).approve(Lobby.address, depositAmount);

    const context0 = [0, 2, 3];
    const hash0 = solidityKeccak256(["uint256[]"], [context0]);
    const goodSignature0 = await alice.signMessage(arrayify(hash0));

    const signedContexts0: SignedContextStruct[] = [
      {
        signer: alice.address,
        signature: goodSignature0,
        context: context0,
      },
    ];

    const aliceJoinTx = await Lobby.connect(alice).join(
      [1234],
      signedContexts0
    );

    const aliceJoinEvent = (await getEventArgs(
      aliceJoinTx,
      "Join",
      Lobby
    )) as JoinEvent["args"];

    const aliceDepositEvent = (await getEventArgs(
      aliceJoinTx,
      "Deposit",
      Lobby
    )) as DepositEvent["args"];

    assert(aliceDepositEvent.sender === alice.address, "wrong deposit sender");
    assert(aliceDepositEvent.token === tokenA.address, "wrong deposit token");
    assert(aliceDepositEvent.amount.eq(depositAmount), "wrong deposit amount");
    assert(aliceJoinEvent.sender === alice.address, "wrong sender");

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

    const bobJoinTx = await Lobby.connect(bob).join([1234], signedContexts1);

    const bobJoinEvent = (await getEventArgs(
      bobJoinTx,
      "Join",
      Lobby
    )) as JoinEvent["args"];

    const bobDepositEvent = (await getEventArgs(
      bobJoinTx,
      "Deposit",
      Lobby
    )) as DepositEvent["args"];

    assert(bobDepositEvent.sender === bob.address, "wrong deposit sender");
    assert(bobDepositEvent.token === tokenA.address, "wrong deposit token");
    assert(bobDepositEvent.amount.eq(depositAmount), "wrong deposit amount");
    assert(bobJoinEvent.sender === bob.address, "wrong sender");

    const currentPhase0 = await Lobby.currentPhase();
    assert(currentPhase0.eq(PHASE_RESULT_PENDING), "Bad Phase");

    const context2 = [1];
    const hash2 = solidityKeccak256(["uint256[]"], [context2]);
    const goodSignature2 = await bot.signMessage(arrayify(hash2));

    const claimContext = [1234];

    const signedContexts2: SignedContextStruct[] = [
      {
        signer: bot.address,
        signature: goodSignature2,
        context: context2,
      },
    ];

    const aliceInvalidTx = await Lobby.connect(bot).invalid(
      claimContext,
      signedContexts2
    );

    const currentPhase1 = await Lobby.currentPhase();
    assert(currentPhase1.eq(PHASE_INVALID), "Bad Phase");

    const { sender: invalidEventSender } = (await getEventArgs(
      aliceInvalidTx,
      "Invalid",
      Lobby
    )) as InvalidEvent["args"];

    assert(invalidEventSender === bot.address, "wrong 'invalid' sender");

    // Checking Context
    const expectedContext0 = [
      [
        ethers.BigNumber.from(bot.address),
        ethers.BigNumber.from(Lobby.address),
      ],
      [ethers.BigNumber.from(1234)],
      [ethers.BigNumber.from(bot.address)],
      [ethers.BigNumber.from(1)],
    ];

    const { sender: sender0_, context: context0_ } = (await getEventArgs(
      aliceInvalidTx,
      "Context",
      Lobby
    )) as ContextEvent["args"];

    assert(sender0_ === bot.address, "wrong sender");
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

  it("should ensure refund is not reentrant", async function () {
    const timeoutDuration = 15000000;
    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];
    const bot = signers[3];

    const maliciousReserveFactory = await ethers.getContractFactory(
      "LobbyReentrantSender"
    );
    const maliciousReserve =
      (await maliciousReserveFactory.deploy()) as LobbyReentrantSender;
    await maliciousReserve.deployed();
    await maliciousReserve.initialize();

    const lobbyConstructorConfig: LobbyConstructorConfigStruct = {
      maxTimeoutDuration: timeoutDuration,
      callerMeta: getRainContractMetaBytes("lobby"),
    };

    const Lobby = (await lobbyFactory.deploy(lobbyConstructorConfig)) as Lobby;

    const depositAmount = ONE;
    const claimAmount = ONE;
    const leaveAmount = ONE;

    await maliciousReserve
      .connect(signers[0])
      .transfer(alice.address, depositAmount);
    await maliciousReserve
      .connect(signers[0])
      .transfer(bob.address, depositAmount);

    const constants = [0, depositAmount, leaveAmount, claimAmount, bot.address];

    // prettier-ignore
    const joinSource = concat([
        op(Opcode.context, 0x0300) ,
        op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 1)) ,
      ]);

    const leaveSource = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)),
    ]);
    const claimSource = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3)),
    ]);
    const invalidSource = concat([
      op(Opcode.context, 0x0200),
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 4)),
      op(Opcode.equal_to),
    ]);

    const lobbyExpressionConfig = {
      sources: [joinSource, leaveSource, claimSource, invalidSource],
      constants: constants,
    };

    const evaluableConfig = await generateEvaluableConfig(
      lobbyExpressionConfig
    );

    const initialConfig: LobbyConfigStruct = {
      refMustAgree: false,
      ref: signers[0].address,
      evaluableConfig: evaluableConfig,
      token: maliciousReserve.address,
      description: [],
      timeoutDuration: timeoutDuration,
    };

    await Lobby.initialize(initialConfig);

    await maliciousReserve.connect(alice).approve(Lobby.address, depositAmount);
    await maliciousReserve.connect(bob).approve(Lobby.address, depositAmount);

    const context0 = [0, 2, 3];
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

    await Lobby.connect(bob).join([1234], signedContexts1);

    const context2 = [1];
    const hash2 = solidityKeccak256(["uint256[]"], [context2]);
    const goodSignature2 = await bot.signMessage(arrayify(hash2));

    const claimContext = [1234];

    const signedContexts2: SignedContextStruct[] = [
      {
        signer: bot.address,
        signature: goodSignature2,
        context: context2,
      },
    ];

    await Lobby.connect(bot).invalid(claimContext, signedContexts2);

    await maliciousReserve.addReentrantTarget(
      Lobby.address,
      [1234],
      signedContexts2
    );

    await assertError(
      async () => await Lobby.connect(alice).refund(),
      "VM Exception while processing transaction: reverted with reason string 'ReentrancyGuard: reentrant call'",
      "Alice Refund Reentrant"
    );

    await assertError(
      async () => await Lobby.connect(bob).refund(),
      "VM Exception while processing transaction: reverted with reason string 'ReentrancyGuard: reentrant call'",
      "Bob Refund Reentrant"
    );
  });
});
