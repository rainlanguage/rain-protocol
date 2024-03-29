import { strict as assert } from "assert";

import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  RainterpreterExpressionDeployer,
  ReserveToken18,
} from "../../typechain";
import {
  CloneFactory,
  DeployerDiscoverableMetaV1ConstructionConfigStruct,
} from "../../typechain/contracts/factory/CloneFactory";

import {
  InitializeEvent,
  Lobby,
  LobbyConfigStruct,
  LobbyConstructorConfigStruct,
} from "../../typechain/contracts/lobby/Lobby";
import {
  assertError,
  compareStructs,
  getRainMetaDocumentFromContract,
  validateContractMetaAgainstABI,
  zeroAddress,
} from "../../utils";
import { ONE } from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import { flowCloneFactory } from "../../utils/deploy/factory/cloneFactory";
import { getTouchDeployer } from "../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
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

describe("Lobby Tests Intialize", async function () {
  const Opcode = RainterpreterOps;
  let cloneFactory: CloneFactory;

  let tokenA: ReserveToken18;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    cloneFactory = await flowCloneFactory();
  });

  beforeEach(async () => {
    tokenA = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await tokenA.initialize();
  });

  it("Lobby is intialized correctly", async function () {
    const signers = await ethers.getSigners();

    const timeoutDuration = 15000000;
    const lobbyImplementation: Lobby = await deployLobby(timeoutDuration);

    const constants = [0, 1, ONE];

    // prettier-ignore
    const joinSource = concat([
        op(Opcode.context, 0x0300) ,
        op(Opcode.read_memory,memoryOperand(MemoryType.Constant, 2))
      ]);

    const leaveSource = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)),
    ]);
    const claimSource = concat([op(Opcode.context, 0x0100)]);

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
      description: "0x00",
      timeoutDuration: timeoutDuration,
    };

    const Lobby_ = await deployLobbyClone(
      signers[0],
      cloneFactory,
      lobbyImplementation,
      initialConfig
    );

    const intializeEvent = (await getEventArgs(
      Lobby_.deployTransaction,
      "Initialize",
      Lobby_
    )) as InitializeEvent["args"];

    assert(
      intializeEvent.sender === cloneFactory.address,
      "wrong deposit sender"
    );
    compareStructs(intializeEvent.config, initialConfig);
  });

  it("should fail if Lobby is deployed with bad callerMeta", async function () {
    const timeoutDuration = 15000000;

    const lobbyFactory = await ethers.getContractFactory("Lobby", {});
    const touchDeployer: RainterpreterExpressionDeployer =
      await getTouchDeployer();

    const interpreterCallerConfig0: DeployerDiscoverableMetaV1ConstructionConfigStruct =
      {
        meta: getRainMetaDocumentFromContract("orderbook"), // Bad callerMeta passed.
        deployer: touchDeployer.address,
      };

    const lobbyConstructorConfig0: LobbyConstructorConfigStruct = {
      maxTimeoutDuration: timeoutDuration,
      deployerDiscoverableMetaConfig: interpreterCallerConfig0,
    };

    await assertError(
      async () => await lobbyFactory.deploy(lobbyConstructorConfig0),
      "UnexpectedMetaHash",
      "Lobby Deployed for bad hash"
    );

    const interpreterCallerConfig1: DeployerDiscoverableMetaV1ConstructionConfigStruct =
      {
        meta: getRainMetaDocumentFromContract("lobby"), // Bad callerMeta passed.
        deployer: touchDeployer.address,
      };

    const lobbyConstructorConfig1: LobbyConstructorConfigStruct = {
      maxTimeoutDuration: timeoutDuration,
      deployerDiscoverableMetaConfig: interpreterCallerConfig1,
    };

    const Lobby: Lobby = (await lobbyFactory.deploy(
      lobbyConstructorConfig1
    )) as Lobby;

    assert(!(Lobby.address === zeroAddress), "Lobby not deployed");
  });

  it("should validate contract meta with abi", async function () {
    assert(
      validateContractMetaAgainstABI("lobby"),
      "Contract Meta Inconsistent with Contract ABI"
    );
  });
});
