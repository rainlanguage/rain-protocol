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
import { DepositEvent, JoinEvent, LobbyConfigStruct, SignedContextStruct } from "../../typechain/contracts/lobby/Lobby";
import { assertError } from "../../utils";
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
  Debug,
  memoryOperand,
  MemoryType,
  op,
} from "../../utils/interpreter/interpreter";
import { AllStandardOps, Opcode } from "../../utils/interpreter/ops/allStandardOps";
import { fixedPointDiv } from "../../utils/math";
import { compareStructs } from "../../utils/test/compareStructs";

describe('Lobby Tests claim',async function () {

    let tokenA: ReserveToken18;
    let interpreter: Rainterpreter;
    let expressionDeployer: RainterpreterExpressionDeployer; 

    const PHASE_REF_PENDING = ethers.BigNumber.from(0);
    const PHASE_PLAYERS_PENDING = ethers.BigNumber.from(1);
    const PHASE_RESULT_PENDING = ethers.BigNumber.from(2);
    const PHASE_COMPLETE = ethers.BigNumber.from(3);
    const PHASE_INVALID = ethers.BigNumber.from(4);
    
    before(async () => { 

      interpreter = await rainterpreterDeploy();
      expressionDeployer = await rainterpreterExpressionDeployerDeploy(interpreter);
      
    });

    beforeEach(async () => { 

        tokenA = (await basicDeploy("ReserveToken18", {})) as ReserveToken18; 
        await tokenA.initialize();
       
    }); 

    it("should ensure player claims on happy path" , async function () {


    })   





})





