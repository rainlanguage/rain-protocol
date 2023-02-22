import { assert } from "chai";
import { Contract } from "ethers";
import { arrayify, concat, solidityKeccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { ReserveToken18 } from "../../../typechain";
import { DepositEvent } from "../../../typechain/contracts/escrow/RedeemableERC20ClaimEscrow";
import { NewCloneEvent } from "../../../typechain/contracts/factory/CloneFactory";
import {
  JoinEvent,
  Lobby,
  LobbyConfigStruct,
  SignedContextStruct,
} from "../../../typechain/contracts/lobby/Lobby";
import {
  generateEvaluableConfig,
  getEventArgs,
  memoryOperand,
  MemoryType,
  ONE,
  op,
  RainterpreterOps,
} from "../../../utils";

import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import { deployLobby } from "../../../utils/deploy/lobby/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";

describe("FactoryCurator createChild", async function () {
  const Opcode = RainterpreterOps;

  let cloneFactory: Contract;
  let tokenA: ReserveToken18;

  const PHASE_RESULT_PENDING = ethers.BigNumber.from(2);

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);
    cloneFactory = await basicDeploy("CloneFactory", {});
  });

  beforeEach(async () => {
    tokenA = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await tokenA.initialize();
  });

  it("should deploy Lobby Clone", async () => {
    const signers = await ethers.getSigners();
    const alice = signers[1];
    const bob = signers[2];

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

    const event = (await getEventArgs(
      lobbyClone,
      "NewClone",
      cloneFactory
    )) as NewCloneEvent["args"];

    const Lobby_ = await ethers.getContractAt("Lobby", event.clone);

    await tokenA.connect(alice).approve(Lobby_.address, depositAmount);

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

    const joinTx = await Lobby_.connect(alice).join([1234], signedContexts0);

    const { sender } = (await getEventArgs(
      joinTx,
      "Join",
      Lobby_
    )) as JoinEvent["args"];

    const {
      sender: depositSender,
      token: depositToken,
      amount,
    } = (await getEventArgs(joinTx, "Deposit", Lobby_)) as DepositEvent["args"];

    assert(depositSender === alice.address, "wrong deposit sender");
    assert(depositToken === tokenA.address, "wrong deposit token");
    assert(amount.eq(depositAmount), "wrong deposit amount");
    assert(sender === alice.address, "wrong sender");

    const currentPhase = await Lobby_.currentPhase();
    assert(currentPhase.eq(PHASE_RESULT_PENDING), "Bad Phase");
  });
});
