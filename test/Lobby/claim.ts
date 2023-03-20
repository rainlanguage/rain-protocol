import { assert } from "chai";

import { arrayify, concat, solidityKeccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  CloneFactory,
  LobbyReentrantSender,
  ReserveToken18,
} from "../../typechain";
import {
  ClaimEvent,
  ContextEvent,
  DepositEvent,
  Lobby,
  LobbyConfigStruct,
  SignedContextStruct,
} from "../../typechain/contracts/lobby/Lobby";
import { assertError, fixedPointMul } from "../../utils";
import {
  eighteenZeros,
  ONE,
  sixteenZeros,
} from "../../utils/constants/bigNumber";
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

describe("Lobby Tests claim", async function () {
  const Opcode = RainterpreterOps;
  let cloneFactory: CloneFactory;
  let tokenA: ReserveToken18;

  const PHASE_RESULT_PENDING = ethers.BigNumber.from(2);
  const PHASE_COMPLETE = ethers.BigNumber.from(3);

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    //Deploy Clone Factory
    cloneFactory = await flowCloneFactory()
  });

  beforeEach(async () => {
    tokenA = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await tokenA.initialize();
  });

  it("should ensure player are able to claim on a good path (shares add up to 1e18)", async function () {
    const signers = await ethers.getSigners();
    const timeoutDuration = 15000000;
    const [, alice, bob, bot] = signers;

    await tokenA.connect(signers[0]).transfer(alice.address, ONE);
    await tokenA.connect(signers[0]).transfer(bob.address, ONE);

    const lobbyImplementation: Lobby = await deployLobby(timeoutDuration);
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

    // Bob Claims Amount
    const bobClaimTx = await Lobby.connect(bob).claim(
      [bobShares],
      signedContexts2
    );

    const expectedClaimBob = fixedPointMul(depositAmount.mul(2), bobShares);

    const bobClaimEvent = (await getEventArgs(
      bobClaimTx,
      "Claim",
      Lobby
    )) as ClaimEvent["args"];

    assert(bobClaimEvent.sender === bob.address, "wrong deposit sender");
    assert(bobClaimEvent.share.eq(bobShares), "wrong shares");
    assert(bobClaimEvent.amount.eq(expectedClaimBob), "wrong claim amount");
  });

  it("should ensure player are able to claim (shares do not add up to 1e18)", async function () {
    const signers = await ethers.getSigners();
    const timeoutDuration = 15000000;
    const [, alice, bob, bot] = signers;

    await tokenA.connect(signers[0]).transfer(alice.address, ONE);
    await tokenA.connect(signers[0]).transfer(bob.address, ONE);

    const lobbyImplementation: Lobby = await deployLobby(timeoutDuration);
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

    //Both computed amounts DO NOT add up to 1e18
    const aliceShares = ethers.BigNumber.from(80 + sixteenZeros);
    const bobShares = ethers.BigNumber.from(30 + sixteenZeros); // incorrectly assigned shares

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

    // Bob Claims with incorrect share amount
    const bobClaimTx = await Lobby.connect(bob).claim(
      [bobShares],
      signedContexts2
    );

    const expectedClaimBob = fixedPointMul(
      depositAmount.mul(2),
      ONE.sub(aliceShares)
    );

    const bobClaimEvent = (await getEventArgs(
      bobClaimTx,
      "Claim",
      Lobby
    )) as ClaimEvent["args"];

    assert(bobClaimEvent.sender === bob.address, "wrong deposit sender");
    assert(bobClaimEvent.share.eq(ONE.sub(aliceShares)), "wrong shares");
    assert(bobClaimEvent.amount.eq(expectedClaimBob), "wrong claim amount");

    //assert both claim add up to total deposit
    assert(
      aliceClaimEvent.amount.add(bobClaimEvent.amount).eq(depositAmount.mul(2))
    );
  });

  it("should ensure claimant is not able to double-claim", async function () {
    const signers = await ethers.getSigners();
    const timeoutDuration = 15000000;
    const [, alice, bob, bot] = signers;

    await tokenA.connect(signers[0]).transfer(alice.address, ONE);
    await tokenA.connect(signers[0]).transfer(bob.address, ONE);
    const lobbyImplementation: Lobby = await deployLobby(timeoutDuration);
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

    //Alice Double Claims

    const aliceClaimTx1 = await Lobby.connect(alice).claim(
      [aliceShares],
      signedContexts2
    );

    const expectedClaimAlice1 = 0; // No claim should be given

    const aliceClaimEvent1 = (await getEventArgs(
      aliceClaimTx1,
      "Claim",
      Lobby
    )) as ClaimEvent["args"];

    assert(aliceClaimEvent1.sender === alice.address, "wrong deposit sender");
    assert(aliceClaimEvent1.share.eq(aliceShares), "wrong shares");
    assert(
      aliceClaimEvent1.amount.eq(expectedClaimAlice1),
      "wrong claim amount"
    );

    // Bob Claims Amount
    const bobClaimTx = await Lobby.connect(bob).claim(
      [bobShares],
      signedContexts2
    );

    const expectedClaimBob = fixedPointMul(depositAmount.mul(2), bobShares);

    const bobClaimEvent = (await getEventArgs(
      bobClaimTx,
      "Claim",
      Lobby
    )) as ClaimEvent["args"];

    assert(bobClaimEvent.sender === bob.address, "wrong deposit sender");
    assert(bobClaimEvent.share.eq(bobShares), "wrong shares");
    assert(bobClaimEvent.amount.eq(expectedClaimBob), "wrong claim amount");
  });

  it("should ensure claimants are able to claim their prorata share of the future deposits", async function () {
    const signers = await ethers.getSigners();
    const timeoutDuration = 15000000;
    const [, alice, bob, bot] = signers;
    const botDespoitAmount = ethers.BigNumber.from(3 + eighteenZeros);

    await tokenA.connect(signers[0]).transfer(alice.address, ONE);
    await tokenA.connect(signers[0]).transfer(bob.address, ONE);
    await tokenA.connect(signers[0]).transfer(bot.address, botDespoitAmount);
    const lobbyImplementation: Lobby = await deployLobby(timeoutDuration);
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

    await tokenA.connect(alice).approve(Lobby.address, ONE);
    await tokenA.connect(bob).approve(Lobby.address, ONE);
    await tokenA.connect(bot).approve(Lobby.address, botDespoitAmount);

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

    // Bob Claims Amount
    const bobClaimTx = await Lobby.connect(bob).claim(
      [bobShares],
      signedContexts2
    );

    const expectedClaimBob = fixedPointMul(depositAmount.mul(2), bobShares);

    const bobClaimEvent = (await getEventArgs(
      bobClaimTx,
      "Claim",
      Lobby
    )) as ClaimEvent["args"];

    assert(bobClaimEvent.sender === bob.address, "wrong deposit sender");
    assert(bobClaimEvent.share.eq(bobShares), "wrong shares");
    assert(bobClaimEvent.amount.eq(expectedClaimBob), "wrong claim amount");

    // Bot Deposits after claims have been made
    const botDeposit = await Lobby.connect(bot).deposit(botDespoitAmount);

    const botDepositEvent = (await getEventArgs(
      botDeposit,
      "Deposit",
      Lobby
    )) as DepositEvent["args"];
    assert(botDepositEvent.sender === bot.address, "wrong deposit sender");
    assert(botDepositEvent.amount.eq(botDespoitAmount), "wrong deposit amount");

    // Alice Claims Again her prorata shares

    const aliceClaimTx1 = await Lobby.connect(alice).claim(
      [aliceShares],
      signedContexts2
    );

    const expectedClaimAlice1 = fixedPointMul(botDespoitAmount, aliceShares);

    const aliceClaimEvent1 = (await getEventArgs(
      aliceClaimTx1,
      "Claim",
      Lobby
    )) as ClaimEvent["args"];

    assert(aliceClaimEvent1.sender === alice.address, "wrong deposit sender");
    assert(aliceClaimEvent1.share.eq(aliceShares), "wrong shares");
    assert(
      aliceClaimEvent1.amount.eq(expectedClaimAlice1),
      "wrong claim amount"
    );

    // Bob Claims Again his prorata shares
    const bobClaimTx1 = await Lobby.connect(bob).claim(
      [bobShares],
      signedContexts2
    );

    const expectedClaimBob1 = fixedPointMul(botDespoitAmount, bobShares);

    const bobClaimEvent1 = (await getEventArgs(
      bobClaimTx1,
      "Claim",
      Lobby
    )) as ClaimEvent["args"];

    assert(bobClaimEvent1.sender === bob.address, "wrong deposit sender");
    assert(bobClaimEvent1.share.eq(bobShares), "wrong shares");
    assert(bobClaimEvent1.amount.eq(expectedClaimBob1), "wrong claim amount");
  });

  it("should validate context emitted in Context Event", async function () {
    const signers = await ethers.getSigners();
    const timeoutDuration = 15000000;
    const [, alice, bob, bot] = signers;
    await tokenA.connect(signers[0]).transfer(alice.address, ONE);
    await tokenA.connect(signers[0]).transfer(bob.address, ONE);
    const lobbyImplementation: Lobby = await deployLobby(timeoutDuration);
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

    // Checking Context for Claim made by Alice
    const expectedContext0 = [
      [
        ethers.BigNumber.from(alice.address),
        ethers.BigNumber.from(Lobby.address),
      ],
      [aliceShares],
      [ethers.BigNumber.from(bot.address)],
      [aliceShares, bobShares],
    ];

    const { sender: sender0_, context: context0_ } = (await getEventArgs(
      aliceClaimTx,
      "Context",
      Lobby
    )) as ContextEvent["args"];

    assert(sender0_ === alice.address, "wrong sender");
    for (let i = 0; i < expectedContext0.length; i++) {
      const rowArray = expectedContext0[i];
      for (let j = 0; j < rowArray.length; j++) {
        const colElement = rowArray[j];
        if (!context0_[i][j].eq(colElement)) {
          throw new Error(`Assertion Error : mismatch at position (${i},${j}),
                       expected  ${colElement}
                       got       ${context0_[i][j]}`);
        }
      }
    }

    // Bob Claims Amount
    const bobClaimTx = await Lobby.connect(bob).claim(
      [bobShares],
      signedContexts2
    );

    const expectedClaimBob = fixedPointMul(depositAmount.mul(2), bobShares);

    const bobClaimEvent = (await getEventArgs(
      bobClaimTx,
      "Claim",
      Lobby
    )) as ClaimEvent["args"];

    assert(bobClaimEvent.sender === bob.address, "wrong deposit sender");
    assert(bobClaimEvent.share.eq(bobShares), "wrong shares");
    assert(bobClaimEvent.amount.eq(expectedClaimBob), "wrong claim amount");

    // Checking Context for Claim made by Bob
    const expectedContext1 = [
      [
        ethers.BigNumber.from(bob.address),
        ethers.BigNumber.from(Lobby.address),
      ],
      [bobShares],
      [ethers.BigNumber.from(bot.address)],
      [aliceShares, bobShares],
    ];

    const { sender: sender1_, context: context1_ } = (await getEventArgs(
      bobClaimTx,
      "Context",
      Lobby
    )) as ContextEvent["args"];

    assert(sender1_ === bob.address, "wrong sender");
    for (let i = 0; i < expectedContext1.length; i++) {
      const rowArray = expectedContext1[i];
      for (let j = 0; j < rowArray.length; j++) {
        const colElement = rowArray[j];
        if (!context1_[i][j].eq(colElement)) {
          assert.fail(`mismatch at position (${i},${j}),
                       expected  ${colElement}
                       got       ${context1_[i][j]}`);
        }
      }
    }
  });

  it("should prevent reentrant claim ", async function () {
    const signers = await ethers.getSigners();
    const timeoutDuration = 15000000;
    const [, alice, bob, bot] = signers;

    const botDespoitAmount = ethers.BigNumber.from(3 + eighteenZeros);

    const maliciousReserveFactory = await ethers.getContractFactory(
      "LobbyReentrantSender"
    );
    const maliciousReserve =
      (await maliciousReserveFactory.deploy()) as LobbyReentrantSender;
    await maliciousReserve.deployed();
    await maliciousReserve.initialize();

    await maliciousReserve.connect(signers[0]).transfer(alice.address, ONE);
    await maliciousReserve.connect(signers[0]).transfer(bob.address, ONE);
    await maliciousReserve
      .connect(signers[0])
      .transfer(bot.address, botDespoitAmount);
    const lobbyImplementation: Lobby = await deployLobby(timeoutDuration);
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
      lobbyExpressionConfig.sources,
      lobbyExpressionConfig.constants
    );

    const initialConfig: LobbyConfigStruct = {
      refMustAgree: false,
      ref: signers[0].address,
      evaluableConfig: evaluableConfig,
      token: maliciousReserve.address,
      description: [],
      timeoutDuration: timeoutDuration,
    };

    const Lobby = await deployLobbyClone(
      signers[0],
      cloneFactory,
      lobbyImplementation,
      initialConfig
    );

    await maliciousReserve.connect(alice).approve(Lobby.address, ONE);
    await maliciousReserve.connect(bob).approve(Lobby.address, ONE);
    await maliciousReserve
      .connect(bot)
      .approve(Lobby.address, botDespoitAmount);

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
    await maliciousReserve.addReentrantTarget(
      Lobby.address,
      [aliceShares],
      signedContexts2
    );

    await assertError(
      async () =>
        await Lobby.connect(alice).claim([aliceShares], signedContexts2),
      "VM Exception while processing transaction: reverted with reason string 'ReentrancyGuard: reentrant call'",
      "Alice Claim Reentrant"
    );

    await maliciousReserve.addReentrantTarget(
      Lobby.address,
      [bobShares],
      signedContexts2
    );

    await assertError(
      async () => await Lobby.connect(bob).claim([bobShares], signedContexts2),
      "VM Exception while processing transaction: reverted with reason string 'ReentrancyGuard: reentrant call'",
      "Bob Claim Reentrant"
    );
  });
});
