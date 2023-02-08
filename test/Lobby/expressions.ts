import { assert } from "chai";
import { ContractFactory } from "ethers";
import { arrayify, concat, solidityKeccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { ReserveToken18 } from "../../typechain";
import {
  ClaimEvent,
  DepositEvent,
  JoinEvent,
  LeaveEvent,
  Lobby,
  LobbyConfigStruct,
  LobbyConstructorConfigStruct,
  SignedContextStruct,
} from "../../typechain/contracts/lobby/Lobby";
import { getRainContractMetaBytes, randomUint256 } from "../../utils";
import { ONE } from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
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
  let lobbyFactory: ContractFactory;
  let tokenA: ReserveToken18;

  const PHASE_PLAYERS_PENDING = ethers.BigNumber.from(1);
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

  it("should ensure SET in ENTRYPOINT_JOIN is avaliable as GET in ENTRYPOINT_LEAVE", async function () {
    const signers = await ethers.getSigners();
    const alice = signers[1];

    await tokenA.connect(signers[0]).transfer(alice.address, ONE.mul(100));
    const lobbyConstructorConfig: LobbyConstructorConfigStruct = {
      maxTimeoutDuration: 15000000,
      callerMeta: getRainContractMetaBytes("lobby"),
    };
    const Lobby = (await lobbyFactory.deploy(lobbyConstructorConfig)) as Lobby;

    const truthyValue = 0;
    const depositAmount = ONE;
    const key = ethers.BigNumber.from(randomUint256());

    const constants = [truthyValue, depositAmount, key];

    // prettier-ignore
    const joinSource = concat([
            // SET key
             op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)), // key
             op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // val
            op(Opcode.set),
            op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 0)) ,
            op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 1))
        ]);

    const leaveSource = concat([
      // GET KEY
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)), // key
      op(Opcode.get),
    ]);
    const claimSource = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
    ]);
    const invalidSource = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
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
      timeoutDuration: 15000000,
    };

    await Lobby.initialize(initialConfig);
    await tokenA.connect(alice).approve(Lobby.address, ONE.mul(100));

    // Alice Joins
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

    // Alice Leaves
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

  it("should ensure SET in ENTRYPOINT_JOIN is avaliable as GET in ENTRYPOINT_CLAIM", async function () {
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
    const key = ethers.BigNumber.from(randomUint256());
    const totalPlayers = 2;

    const constants = [0, depositAmount, key, totalPlayers];

    // prettier-ignore
    const joinSource = concat([
         // SET key
         op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)), // key
         op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // val
        op(Opcode.set),
        op(Opcode.context, 0x0300) ,
        op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 1)) ,
      ]);

    const leaveSource = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)), // leave amount zero
    ]);

    const claimSource = concat([
      // GET KEY
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)), // key
      op(Opcode.get),
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3)),
      op(Opcode.div, 2),
    ]);

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

    //Signed Context by bot address
    const context2 = [1234];
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
      [1234],
      signedContexts2
    );

    const expectedClaimAlice = depositAmount;

    const aliceClaimEvent = (await getEventArgs(
      aliceClaimTx,
      "Claim",
      Lobby
    )) as ClaimEvent["args"];

    assert(aliceClaimEvent.sender === alice.address, "wrong deposit sender");
    assert(aliceClaimEvent.share.eq(ONE.div(totalPlayers)), "wrong shares");
    assert(aliceClaimEvent.amount.eq(expectedClaimAlice), "wrong claim amount");

    // Checking Phase
    const currentPhase1 = await Lobby.currentPhase();
    assert(currentPhase1.eq(PHASE_COMPLETE), "Bad Phase");

    // Bob Claims Amount
    const bobClaimTx = await Lobby.connect(bob).claim([1234], signedContexts2);

    const expectedClaimBob = depositAmount;

    const bobClaimEvent = (await getEventArgs(
      bobClaimTx,
      "Claim",
      Lobby
    )) as ClaimEvent["args"];

    assert(bobClaimEvent.sender === bob.address, "wrong deposit sender");
    assert(bobClaimEvent.share.eq(ONE.div(totalPlayers)), "wrong shares");
    assert(bobClaimEvent.amount.eq(expectedClaimBob), "wrong claim amount");
  });

  it("should ensure SET in ENTRYPOINT_JOIN is avaliable as GET in ENTRYPOINT_INVALID", async function () {
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
    const key = ethers.BigNumber.from(randomUint256());

    await tokenA.connect(signers[0]).transfer(alice.address, depositAmount);
    await tokenA.connect(signers[0]).transfer(bob.address, depositAmount);

    const constants = [1, depositAmount, leaveAmount, claimAmount, key];

    // prettier-ignore
    const joinSource = concat([
        // SET key
         op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 4)), // key
         op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)), // val
        op(Opcode.set),
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
      // GET KEY
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 4)), // key
      op(Opcode.get),
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

    // Alice Joins
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

    // Bob Joins
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

    // Invalidate
    await Lobby.connect(bot).invalid(claimContext, signedContexts2);

    const currentPhase1 = await Lobby.currentPhase();
    assert(currentPhase1.eq(PHASE_INVALID), "Bad Phase");
  });

  it("should ensure expressions eval correctly for complex sources", async function () {
    // Example of a three player lobby.

    const timeoutDuration = 15000000;
    const signers = await ethers.getSigners();
    const alice = signers[1];
    const bob = signers[2];
    const carol = signers[3];
    const bot = signers[4];

    const lobbyConstructorConfig: LobbyConstructorConfigStruct = {
      maxTimeoutDuration: timeoutDuration,
      callerMeta: getRainContractMetaBytes("lobby"),
    };
    const Lobby = (await lobbyFactory.deploy(lobbyConstructorConfig)) as Lobby;

    const depositAmount = ONE;
    const playerCount = ethers.BigNumber.from(randomUint256());
    const maxPlayers = 3;

    await tokenA.connect(signers[0]).transfer(alice.address, depositAmount);
    await tokenA.connect(signers[0]).transfer(bob.address, depositAmount);
    await tokenA.connect(signers[0]).transfer(carol.address, depositAmount);

    const constants = [0, 1, depositAmount, playerCount, maxPlayers, 2];

    // prettier-ignore
    // Each joining players makes a deposit of ONE. When playerCount reaches maxPlayers, lobby gets finalized
    const joinSource = concat([
        // SET key
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3)), // key
           op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3)), // <-- val
          op(Opcode.get),
          op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 1)) ,
         op(Opcode.add,2),
        op(Opcode.set),

        op(Opcode.context, 0x0000), // key
         op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 2)) , //val
        op(Opcode.set),

        op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 4)) ,
          op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3)), // key
        op(Opcode.get),
       op(Opcode.equal_to) ,
       op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 2))
    ]);

    // prettier-ignore
    const leaveSource = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
    ]);

    // prettier-ignore
    // Winner gets 50 percent of shares.Rest is divided among others.
    const claimSource = concat([
      // condition
        op(Opcode.context, 0x0000),
        op(Opcode.get),
        op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 0)) ,
        op(Opcode.greater_than),
      // truthy
            op(Opcode.context, 0x0000),
            op(Opcode.context, 0x0300),
            op(Opcode.equal_to) ,
                op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 2)) ,
                op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 5)) ,
              op(Opcode.div,2) ,
                op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 2)) ,
                op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 5)) ,
                  op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 4)) ,
                  op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 1)) ,
                op(Opcode.sub,2),
              op(Opcode.div,3) ,
          op(Opcode.eager_if) ,
      // falsy
          op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 0)) ,
      op(Opcode.eager_if) ,
    ]);

    // prettier-ignore
    const invalidSource = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
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
    await tokenA.connect(carol).approve(Lobby.address, depositAmount);

    //  Alice Joins
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

    // Bob Joins
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

    // Carol Join Lobby
    const context2 = [7, 8, 9];
    const hash2 = solidityKeccak256(["uint256[]"], [context2]);
    const goodSignature2 = await carol.signMessage(arrayify(hash2));

    const signedContexts2: SignedContextStruct[] = [
      {
        signer: carol.address,
        signature: goodSignature2,
        context: context2,
      },
    ];

    const carolJoinTx = await Lobby.connect(carol).join(
      [1234],
      signedContexts2
    );

    const carolJoinEvent = (await getEventArgs(
      carolJoinTx,
      "Join",
      Lobby
    )) as JoinEvent["args"];

    const carolDepositEvent = (await getEventArgs(
      carolJoinTx,
      "Deposit",
      Lobby
    )) as DepositEvent["args"];

    assert(carolDepositEvent.sender === carol.address, "wrong deposit sender");
    assert(carolDepositEvent.token === tokenA.address, "wrong deposit token");
    assert(carolDepositEvent.amount.eq(depositAmount), "wrong deposit amount");
    assert(carolJoinEvent.sender === carol.address, "wrong sender");

    const currentPhase0 = await Lobby.currentPhase();
    assert(currentPhase0.eq(PHASE_RESULT_PENDING), "Bad Phase");

    //Signed Context by bot address
    const context3 = [alice.address];
    const hash3 = solidityKeccak256(["uint256[]"], [context3]);
    const goodSignature3 = await bot.signMessage(arrayify(hash3));

    const signedContexts3: SignedContextStruct[] = [
      {
        signer: bot.address,
        signature: goodSignature3,
        context: context3,
      },
    ];

    // Alice Claims Amount
    const aliceClaimTx = await Lobby.connect(alice).claim(
      [1234],
      signedContexts3
    );

    const expectedClaimAlice = depositAmount.mul(3).div(2);
    const aliceClaimEvent = (await getEventArgs(
      aliceClaimTx,
      "Claim",
      Lobby
    )) as ClaimEvent["args"];

    assert(aliceClaimEvent.sender === alice.address, "wrong deposit sender");
    assert(aliceClaimEvent.share.eq(ONE.div(2)), "wrong shares");
    assert(aliceClaimEvent.amount.eq(expectedClaimAlice), "wrong claim amount");

    // Checking Phase
    const currentPhase1 = await Lobby.currentPhase();
    assert(currentPhase1.eq(PHASE_COMPLETE), "Bad Phase");

    // Bob Claims Amount
    const bobClaimTx = await Lobby.connect(bob).claim([1234], signedContexts3);

    const expectedClaimBob = depositAmount.mul(3).div(4);

    const bobClaimEvent = (await getEventArgs(
      bobClaimTx,
      "Claim",
      Lobby
    )) as ClaimEvent["args"];

    assert(bobClaimEvent.sender === bob.address, "wrong deposit sender");
    assert(bobClaimEvent.share.eq(ONE.div(4)), "wrong shares");
    assert(bobClaimEvent.amount.eq(expectedClaimBob), "wrong claim amount");

    // Carol Claims Amount
    const carolClaimTx = await Lobby.connect(carol).claim(
      [1234],
      signedContexts3
    );

    const expectedClaimCarol = depositAmount.mul(3).div(4);

    const carolClaimEvent = (await getEventArgs(
      carolClaimTx,
      "Claim",
      Lobby
    )) as ClaimEvent["args"];

    assert(carolClaimEvent.sender === carol.address, "wrong deposit sender");
    assert(carolClaimEvent.share.eq(ONE.div(4)), "wrong shares");
    assert(carolClaimEvent.amount.eq(expectedClaimCarol), "wrong claim amount");
  });
});
