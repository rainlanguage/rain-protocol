import { ethers } from "hardhat";
import { RainterpreterExpressionDeployer } from "../../typechain";
import { getRainMetaDocumentFromContract } from "../../utils";
import { registerContract } from "../utils";
import {
  Lobby as LobbyType,
  LobbyConstructorConfigStruct,
} from "../../typechain/contracts/lobby/Lobby";
import { DeployerDiscoverableMetaV1ConstructionConfigStruct } from "../../typechain/contracts/factory/CloneFactory";

export const deployLobby = async (
  deployer_: RainterpreterExpressionDeployer,
  timeoutDuration: number
) => {
  const lobbyFactory = await ethers.getContractFactory("Lobby");

  const deployerDiscoverableMetaConfig: DeployerDiscoverableMetaV1ConstructionConfigStruct =
    {
      meta: getRainMetaDocumentFromContract("lobby"),
      deployer: deployer_.address,
    };

  const lobbyConstructorConfig: LobbyConstructorConfigStruct = {
    maxTimeoutDuration: timeoutDuration,
    deployerDiscoverableMetaConfig,
  };

  const Lobby = (await lobbyFactory.deploy(
    lobbyConstructorConfig
  )) as LobbyType;

  registerContract("Lobby", Lobby.address, lobbyConstructorConfig);
};
