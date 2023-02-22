import { Contract } from "ethers";
import { ethers } from "hardhat";
import { RainterpreterExpressionDeployer } from "../../../typechain";
import {
  CloneFactory,
  NewCloneEvent,
} from "../../../typechain/contracts/factory/CloneFactory";
import { InterpreterCallerV1ConstructionConfigStruct } from "../../../typechain/contracts/flow/FlowCommon";
import {
  Lobby,
  LobbyConfigStruct,
  LobbyConstructorConfigStruct,
} from "../../../typechain/contracts/lobby/Lobby";
import { getEventArgs } from "../../events";
import { getRainContractMetaBytes } from "../../meta";
import { getTouchDeployer } from "../interpreter/shared/rainterpreterExpressionDeployer/deploy";

export const deployLobby = async (timeoutDuration: number): Promise<Lobby> => {
  const lobbyFactory = await ethers.getContractFactory("Lobby", {});
  const touchDeployer: RainterpreterExpressionDeployer =
    await getTouchDeployer();

  const interpreterCallerConfig: InterpreterCallerV1ConstructionConfigStruct = {
    callerMeta: getRainContractMetaBytes("lobby"),
    deployer: touchDeployer.address,
  };

  const lobbyConstructorConfig: LobbyConstructorConfigStruct = {
    maxTimeoutDuration: timeoutDuration,
    interpreterCallerConfig,
  };

  const Lobby = (await lobbyFactory.deploy(lobbyConstructorConfig)) as Lobby;

  return Lobby;
};

export const deployLobbyClone = async (
  cloneFactory: CloneFactory,
  lobbyImplementation: Lobby,
  initialConfig: LobbyConfigStruct
): Promise<Lobby> => {
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

  const cloneEvent = (await getEventArgs(
    lobbyClone,
    "NewClone",
    cloneFactory
  )) as NewCloneEvent["args"];

  const Lobby_ = (await ethers.getContractAt(
    "Lobby",
    cloneEvent.clone
  )) as Lobby;

  return Lobby_;
};
