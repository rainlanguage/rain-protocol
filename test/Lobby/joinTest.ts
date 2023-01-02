import { assert } from "chai";
import { ContractFactory } from "ethers";
import { arrayify, concat, solidityKeccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {

  Lobby,
  Rainterpreter,
  RainterpreterExpressionDeployer,
  ReserveToken18,
} from "../../typechain";
import { LobbyConfigStruct, SignedContextStruct } from "../../typechain/contracts/lobby/Lobby";
import { randomUint256 } from "../../utils/bytes";
import {
  eighteenZeros,
  max_uint256,
  ONE,
} from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import { rainterpreterDeploy } from "../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployerDeploy } from "../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import { getEventArgs } from "../../utils/events";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../utils/interpreter/interpreter";
import { AllStandardOps, Opcode } from "../../utils/interpreter/ops/allStandardOps";
import { fixedPointDiv } from "../../utils/math";
import { compareStructs } from "../../utils/test/compareStructs";

describe.only('Lobby Tests',async function () {

    let tokenA: ReserveToken18;
    let interpreter: Rainterpreter;
    let expressionDeployer: RainterpreterExpressionDeployer;
    let Lobby


    before(async () => {
        const signers = await ethers.getSigners();

        tokenA = (await basicDeploy("ReserveToken18", {})) as ReserveToken18; 

        await tokenA.initialize();

        interpreter = await rainterpreterDeploy();
        expressionDeployer = await rainterpreterExpressionDeployerDeploy(interpreter);
        Lobby = await basicDeploy('Lobby' , {} , [15000000])

        let constants = [0,ONE,ONE,0] 

        // prettier-ignore
        const joinSource = concat([
            op(Opcode.READ_MEMORY,memoryOperand(MemoryType.Constant, 0)),
            op(Opcode.READ_MEMORY,memoryOperand(MemoryType.Constant, 1))
        ]);

        const leaveSource = concat([
            op(Opcode.READ_MEMORY,memoryOperand(MemoryType.Constant, 2))
        ])
        const claimSource = concat([
            op(Opcode.READ_MEMORY,memoryOperand(MemoryType.Constant, 3))
        ])

        let lobbyStateConfig = {
            sources : [joinSource , leaveSource , claimSource, [] ] ,
            constants : constants
        }

        let initialConfig : LobbyConfigStruct = {
            refMustAgree : false ,
            ref : signers[0].address ,
            expressionDeployer : expressionDeployer.address ,
            interpreter : interpreter.address ,
            token : tokenA.address ,
            stateConfig : lobbyStateConfig ,
            description : []  ,
            timeoutDuration : 15000000
        }

        await Lobby.initialize(initialConfig)

      });

    it("should ensure player joins lobby" , async function () {

      const signers = await ethers.getSigners();

      const alice = signers[1]; 
      console.log("ALice here :" , alice.address )
      console.log("Lobby here  :" , Lobby.address )

      const bob = signers[2]; 

      await tokenA.connect(signers[0]).transfer(alice.address , ONE.mul(100)) 
      console.log("alice :" , await tokenA.balanceOf(alice.address)  )

      await tokenA.connect(alice).approve(Lobby.address , ONE.mul(100))


      const context0 = [1, 2, 3];
      const hash0 = solidityKeccak256(["uint256[]"], [context0]);
      const goodSignature0 = await alice.signMessage(arrayify(hash0));

      const signedContexts0: SignedContextStruct[] = [
          {
            signer: alice.address,
            signature: goodSignature0,
            context: context0,
          }
        ];
  
      await Lobby
          .connect(alice)
          .join( [1234], signedContexts0);   

      console.log("alice here 2 :" , await tokenA.balanceOf(alice.address)  )


      await Lobby
      .connect(alice)
      .leave( [1234], signedContexts0); 

      console.log("alice here 3 :" , await tokenA.balanceOf(alice.address)  )


      

    })  


    // it("should ensure player leaves lobby" , async function () {

    //   const signers = await ethers.getSigners();

    //   const alice = signers[1]; 
    //   const bob = signers[2]; 

    //   // await tokenA.connect(signers[0]).transfer(alice.address , ONE.mul(100)) 
    //   console.log("alice balance before:" , await tokenA.balanceOf(alice.address)  )



    //   const context0 = [1, 2, 3];
    //   const hash0 = solidityKeccak256(["uint256[]"], [context0]);
    //   const goodSignature0 = await alice.signMessage(arrayify(hash0));

    //   const signedContexts0: SignedContextStruct[] = [
    //       {
    //         signer: alice.address,
    //         signature: goodSignature0,
    //         context: context0,
    //       }
    //     ];

    //   await Lobby
    //       .connect(alice)
    //       .leave( [1234], signedContexts0); 

    //   console.log("alice balance after:" , await tokenA.balanceOf(alice.address)  )
      

    // })





})





