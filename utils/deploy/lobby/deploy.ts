import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { artifacts, ethers } from "hardhat";
import { RainterpreterExpressionDeployer } from "../../../typechain";
import {
  CloneFactory,
  DeployerDiscoverableMetaV1ConstructionConfigStruct,
} from "../../../typechain/contracts/factory/CloneFactory";
import {
  Lobby,
  LobbyConfigStruct,
  LobbyConstructorConfigStruct,
} from "../../../typechain/contracts/lobby/Lobby";
import { getEventArgs } from "../../events";
import { getRainMetaDocumentFromContract } from "../../meta";
import { getTouchDeployer } from "../interpreter/shared/rainterpreterExpressionDeployer/deploy";

export const deployLobby = async (timeoutDuration: number): Promise<Lobby> => {
  const lobbyFactory = await ethers.getContractFactory("Lobby", {});
  const touchDeployer: RainterpreterExpressionDeployer =
    await getTouchDeployer();

  const deployerDiscoverableMetaConfig: DeployerDiscoverableMetaV1ConstructionConfigStruct =
    {
      meta: getRainMetaDocumentFromContract("lobby"),
      deployer: touchDeployer.address,
    };

  const lobbyConstructorConfig: LobbyConstructorConfigStruct = {
    maxTimeoutDuration: timeoutDuration,
    deployerDiscoverableMetaConfig,
  };

  const Lobby = (await lobbyFactory.deploy(lobbyConstructorConfig)) as Lobby;

  return Lobby;
};

export const deployLobbyClone = async (
  deployer: SignerWithAddress,
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

  const lobby = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(lobbyClone, "NewClone", cloneFactory)).clone
      ),
      20 // address bytes length
    ),
    (await artifacts.readArtifact("Lobby")).abi,
    deployer
  ) as Lobby;

  await lobby.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  lobby.deployTransaction = lobbyClone;

  return lobby;
};
