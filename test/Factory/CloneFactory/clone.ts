import { assert } from "chai";
import { Contract } from "ethers";
import { arrayify, concat, solidityKeccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { CombineTier, ReserveToken, ReserveToken18 } from "../../../typechain";
import { DepositEvent } from "../../../typechain/contracts/escrow/RedeemableERC20ClaimEscrow";
import { CloneFactory, NewCloneEvent } from "../../../typechain/contracts/factory/CloneFactory";
import {
  JoinEvent,
  Lobby,
  LobbyConfigStruct,
  SignedContextStruct,
} from "../../../typechain/contracts/lobby/Lobby";
import { Stake, StakeConfigStruct } from "../../../typechain/contracts/stake/Stake";
import {
  assertError,
  combineTierImplementation,
  generateEvaluableConfig,
  getEventArgs,
  max_uint256,
  memoryOperand,
  MemoryType,
  ONE,
  op,
  RainterpreterOps,
  stakeCloneDeploy,
  stakeImplementation,
} from "../../../utils";

import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import { deployLobby } from "../../../utils/deploy/lobby/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";

describe("CloneFactory tests", async function () {
  const Opcode = RainterpreterOps;

  let cloneFactory: CloneFactory;
  let implementationCombineTier: CombineTier;
  let implementationLobby: Lobby
  let implementationStake: Stake


  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]); 

  implementationCombineTier = await combineTierImplementation();
  implementationLobby = await deployLobby(15000000);
  implementationStake = await stakeImplementation()
    
    //Deploy Clone Factory
    cloneFactory = (await basicDeploy("CloneFactory", {})) as CloneFactory; 
  });

  it("should revert if implementation address is zero", async () => { 

    const token = (await basicDeploy("ReserveToken", {})) as ReserveToken;

    const evaluableConfig0 = await generateEvaluableConfig(
      [
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
      ],
      [max_uint256]
    );

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      evaluableConfig: evaluableConfig0,
    }; 

    const encodedConfig = ethers.utils.defaultAbiCoder.encode(
      [
        "tuple(address asset ,string name, string symbol , tuple(address deployer,bytes[] sources,uint256[] constants) evaluableConfig)",
      ],
      [stakeConfigStruct]
    ); 

    await assertError(
      async () =>
      await cloneFactory.clone(
        ethers.constants.AddressZero,
        encodedConfig
      ),
      "ZeroImplementation",
      "Deployed with zero implementation"
    );
  }) 

  it("should not clone contract with incorrect implementation contract or data", async () => {  
    
    const token = (await basicDeploy("ReserveToken", {})) as ReserveToken;

    const evaluableConfig0 = await generateEvaluableConfig(
      [
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
      ],
      [max_uint256]
    );

    const stakeConfigStruct0: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      evaluableConfig: evaluableConfig0,
    }; 

    const encodedConfig0 = ethers.utils.defaultAbiCoder.encode(
      [
        "tuple(address asset ,string name, string symbol , tuple(address deployer,bytes[] sources,uint256[] constants) evaluableConfig)",
      ],
      [stakeConfigStruct0]
    );  

    assertError(
      async () => await cloneFactory.clone(
        implementationLobby.address,
        encodedConfig0
      ) , 
      "" ,
      "Deployed with Incorrect implementation"
    ) 

    const stakeConfigStruct1  = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address
    }; 

    const encodedConfig1 = ethers.utils.defaultAbiCoder.encode(
      [
        "tuple(address asset ,string name, string symbol)",
      ],
      [stakeConfigStruct1]
    );  

    assertError(
      async () => await cloneFactory.clone(
        implementationLobby.address,
        encodedConfig1
      ) , 
      "" ,
      "Deployed with Incorrect data"
    )

    
  })
 
  it("should initialize clone with correct data", async () => {  
    const signers = await ethers.getSigners()

    const token = (await basicDeploy("ReserveToken", {})) as ReserveToken;

    const evaluableConfig = await generateEvaluableConfig(
      [
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
      ],
      [max_uint256]
    );

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      evaluableConfig: evaluableConfig,
    }; 

    const encodedConfig = ethers.utils.defaultAbiCoder.encode(
      [
        "tuple(address asset ,string name, string symbol , tuple(address deployer,bytes[] sources,uint256[] constants) evaluableConfig)",
      ],
      [stakeConfigStruct]
    );  

    const stakeClone = await cloneFactory.clone(
      implementationStake.address,
      encodedConfig
    );
  
    const cloneEvent = (await getEventArgs(
      stakeClone,
      "NewClone",
      cloneFactory
    )) as NewCloneEvent["args"];   

    assert(cloneEvent.sender == signers[0].address , "Incorrect sender")
    assert(cloneEvent.implementation == implementationStake.address , "Incorrect implementation")
    assert(cloneEvent.data == encodedConfig, "Incorrect data")
    
  })
 
});
