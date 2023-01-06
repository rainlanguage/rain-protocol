import { assert } from "chai";
import { arrayify, concat, solidityKeccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  Rainterpreter,
  RainterpreterExpressionDeployer,
  ReserveToken18,
} from "../../typechain";
import {
  ClaimEvent,
  DepositEvent,
  LobbyConfigStruct,
  SignedContextStruct,
} from "../../typechain/contracts/lobby/Lobby";
import { fixedPointMul } from "../../utils";
import { ONE, sixteenZeros } from "../../utils/constants/bigNumber";
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

describe("Lobby Tests claim", async function () {
  const Opcode = RainterpreterOps;

  let tokenA: ReserveToken18;
  let interpreter: Rainterpreter;
  let expressionDeployer: RainterpreterExpressionDeployer;

  const PHASE_RESULT_PENDING = ethers.BigNumber.from(2);
  const PHASE_COMPLETE = ethers.BigNumber.from(3);

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

  it("should ensure player are able to claim on a good path (shares add up to 1e18)", async function () {
    const signers = await ethers.getSigners();
    const timeoutDuration = 15000000;
    const alice = signers[1];
    const bob = signers[2];
    const bot = signers[3];

    await tokenA.connect(signers[0]).transfer(alice.address, ONE);
    await tokenA.connect(signers[0]).transfer(bob.address, ONE);

    const Lobby = await basicDeploy("Lobby", {}, [timeoutDuration]);
    const depositAmount = ONE;

    const constants = [0, depositAmount];

    // prettier-ignore
    const joinSource = concat([
        op(Opcode.CONTEXT, 0x0300) ,
        op(Opcode.READ_MEMORY,memoryOperand(MemoryType.Constant, 1)) ,
      ]);

    const leaveSource = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // leave amount zero
    ]);

    const claimSource = concat([op(Opcode.CONTEXT, 0x0100)]);

    const invalidSource = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // lobby not invalid
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
    const alice = signers[1];
    const bob = signers[2];
    const bot = signers[3];

    await tokenA.connect(signers[0]).transfer(alice.address, ONE);
    await tokenA.connect(signers[0]).transfer(bob.address, ONE);

    const Lobby = await basicDeploy("Lobby", {}, [timeoutDuration]);
    const depositAmount = ONE;

    const constants = [0, depositAmount];

    // prettier-ignore
    const joinSource = concat([
        op(Opcode.CONTEXT, 0x0300) ,
        op(Opcode.READ_MEMORY,memoryOperand(MemoryType.Constant, 1)) ,
      ]);

    const leaveSource = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // leave amount zero
    ]);

    const claimSource = concat([op(Opcode.CONTEXT, 0x0100)]);

    const invalidSource = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // lobby not invalid
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
});
