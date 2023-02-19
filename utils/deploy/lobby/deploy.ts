import { ethers } from "hardhat";
import { RainterpreterExpressionDeployer } from "../../../typechain";
import { InterpreterCallerV1ConstructionConfigStruct } from "../../../typechain/contracts/flow/FlowCommon";
import { Lobby, LobbyConstructorConfigStruct } from "../../../typechain/contracts/lobby/Lobby";
import { getRainContractMetaBytes } from "../../meta";
import { getTouchDeployer } from "../interpreter/shared/rainterpreterExpressionDeployer/deploy";

export const deployLobby = async (
    timeoutDuration: number
): Promise<Lobby> => {
    const lobbyFactory = await ethers.getContractFactory("Lobby", {});  
    const touchDeployer: RainterpreterExpressionDeployer = await getTouchDeployer()
     
    const interpreterCallerConfig: InterpreterCallerV1ConstructionConfigStruct = {
        callerMeta : getRainContractMetaBytes("lobby") , 
        deployer : touchDeployer.address
    }
        
    const lobbyConstructorConfig: LobbyConstructorConfigStruct = {
        maxTimeoutDuration: timeoutDuration,
        interpreterCallerConfig
    };

    const Lobby = (await lobbyFactory.deploy(lobbyConstructorConfig)) as Lobby; 

    return Lobby
    
} 