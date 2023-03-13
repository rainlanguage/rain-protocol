import { ethers } from "hardhat";
import { RainterpreterExpressionDeployer } from "../../typechain";
import { InterpreterCallerV1ConstructionConfigStruct } from "../../typechain/contracts/flow/FlowCommon";
import { getRainMetaDocumentFromContract } from "../../utils";
import { registerContract } from "../utils";
import {
  Lobby as LobbyType,
  LobbyConstructorConfigStruct,
} from "../../typechain/contracts/lobby/Lobby";

export const deployLobby = async (
  deployer_: RainterpreterExpressionDeployer,
  timeoutDuration: number
) => {
  const lobbyFactory = await ethers.getContractFactory("Lobby", {});

  const interpreterCallerConfig: InterpreterCallerV1ConstructionConfigStruct = {
    meta: getRainMetaDocumentFromContract("lobby"),
    deployer: deployer_.address,
  };

  const lobbyConstructorConfig: LobbyConstructorConfigStruct = {
    maxTimeoutDuration: timeoutDuration,
    interpreterCallerConfig,
  };

  const Lobby = (await lobbyFactory.deploy(
    lobbyConstructorConfig
  )) as LobbyType;

  registerContract("Lobby", Lobby.address);
};
