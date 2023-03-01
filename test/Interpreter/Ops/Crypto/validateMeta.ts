import { assert } from "chai";
import { BytesLike, concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import { max_uint256, memoryOperand, MemoryType, op, Opcode, randomUint256, standardEvaluableConfig } from "../../../../utils";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";  
import OpHash from "../../../../contracts/interpreter/ops/crypto/OpHash.opmeta.json"


describe("HASH Opcode test", async function () {
  let rainInterpreter: Rainterpreter;
  let logic: IInterpreterV1Consumer;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);
    rainInterpreter = await rainterpreterDeploy();

    const consumerFactory = await ethers.getContractFactory(
      "IInterpreterV1Consumer"
    );
    logic = (await consumerFactory.deploy()) as IInterpreterV1Consumer;
    await logic.deployed();
  }); 
  
  const getArrayOfLength = (length) => {  
    let arr = []
    for(let i = 0 ; i < length ; i++){
      arr.push(randomUint256())
    } 
    return arr
  } 

  const randomIntFromInterval = (min, max) => { // min and max included 
    return Math.floor(Math.random() * (max - min + 1) + min)
  } 

  const buildSources = (constants) => {
    let soruceArray = []
    for(let i = 0 ; i < constants.length ; i++){
      soruceArray.push(
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, constants[i]))
      )
    }  
    let sources = concat(soruceArray)
    return sources

  }

  const opHashBuilder = () => {
    let opreand = OpHash.operand[0] 
    let rangeInput = randomIntFromInterval(opreand.validRange[0][0],opreand.validRange[0][1])  // picking from range
    let bitsToShift = randomIntFromInterval(opreand.bits[0],opreand.bits[1]) 

    let inputLength = rangeInput << bitsToShift  
    console.log("inputLength : " , inputLength )
    let constants = getArrayOfLength(rangeInput) 
    let sources = buildSources(constants)  
    
    return {
      sources ,
      constants
    }
   
  }

  it.only("should hash a single value", async () => {
   
    const {sources , constants} = opHashBuilder()

    const expression0 = await expressionConsumerDeploy(
      [sources],
      constants,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result = await logic.stackTop();
    const expectedValue = ethers.utils.solidityKeccak256(
      ["uint256[]"],
      [constants]
    );

    assert(
      result.eq(expectedValue),
      `Invalid output, expected ${expectedValue}, actual ${result}`
    );

  });  

  

});
