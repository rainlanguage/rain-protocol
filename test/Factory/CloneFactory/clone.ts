import { assert } from "chai";
import { ContractFactory } from "ethers";
import { concat, defaultAbiCoder } from "ethers/lib/utils";
import { artifacts, ethers } from "hardhat";
import { CloneFactory, ReserveToken18 } from "../../../typechain";
import { LobbyConfigStruct } from "../../../typechain/contracts/lobby/Lobby";
import { generateEvaluableConfig, memoryOperand, MemoryType, ONE, op, RainterpreterOps } from "../../../utils";

import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import { deployLobby } from "../../../utils/deploy/lobby/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy"; 




describe("FactoryCurator createChild", async function () {
  const Opcode = RainterpreterOps;

  let cloneFactory
  let tokenA: ReserveToken18;


  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]); 
    cloneFactory = await basicDeploy("CloneFactory",{})

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

    const Lobby = await deployLobby(timeoutDuration)  

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

    let encodedConfig = ethers.utils.defaultAbiCoder.encode(
      [
        "tuple(bool refMustAgree ,address ref,address token,tuple(address deployer,bytes[] sources,uint256[] constants) evaluableConfig, bytes description , uint256 timeoutDuration)",
      ],
      [initialConfig]
    );   

    let lobbyClone = cloneFactory.clone(Lobby.address ,encodedConfig ) 
    console.log("lobbyClone : " , lobbyClone.address)


    




    
  });

 
});
