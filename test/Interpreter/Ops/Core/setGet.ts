import { assert } from "chai";
import { randomBytes } from "crypto";
import { concat, keccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";

import {
  memoryOperand,
  MemoryType,
  op,
  RainterpreterOps,
} from "../../../../utils";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { iinterpreterV1ConsumerDeploy , expressionDeployConsumer } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";

const Opcode = RainterpreterOps;

describe("SET/GET Opcode tests", async function () {
  it("should set a key value pair and overwrite it", async () => {
    const key1 = 100;
    const val1 = ethers.constants.MaxUint256;
    const val2 = 555;

    const constants = [key1, val1, val2];

    // prettier-ignore
    const source = concat([
        // SET key1
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // key
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // val
      op(Opcode.SET),

        // GET KEY 1
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // key
      op(Opcode.GET),
      
        // SET key1 again
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // key
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)), // val
      op(Opcode.SET),
      
        // GET KEY 1
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0 )), // key
      op(Opcode.GET),
      
    ]);

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy({
        sources: [source],
        constants,
      });

    // Eval
    await consumerLogic.eval(interpreter.address, dispatch, [[]]);

    const stack = await consumerLogic.stack(); 
    console.log("stack : " , stack )
    assert(stack.length == 2, "Invalid stack length");
    assert(stack[0].eq(constants[1]), "Invalid value was SET / GET for key 1");
    assert(stack[1].eq(constants[2]), "Invalid value was SET / GET for key 1");
  });

  it("should set and get multiple values", async () => {
    const key1 = 100;
    const key2 = 101;
    const key3 = 102;
    const val1 = ethers.constants.MaxUint256;
    const val2 = 0;
    const val3 = 555;

    const constants = [key1, val1, key2, val2, key3, val3];

    // prettier-ignore
    const source = concat([
        // SET key1
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // key
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // val
      op(Opcode.SET),

        // GET KEY 1
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // key
      op(Opcode.GET),
      
        // SET key2
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)), // key
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)), // val
      op(Opcode.SET),
      
        // GET KEY 2
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)), // key
      op(Opcode.GET),
      
        // SET key3
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 4)), // key
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 5)), // val
      op(Opcode.SET),

        // GET KEY 3
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 4)), // key
      op(Opcode.GET),
    ]);

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy({
        sources: [source],
        constants,
      });

    // Eval
    await consumerLogic.eval(interpreter.address, dispatch, [[]]);

    const stack = await consumerLogic.stack();
    assert(stack.length == 3, "Invalid stack length");
    assert(stack[0].eq(constants[1]), "Invalid value was SET / GET for key 1");
    assert(stack[1].eq(constants[3]), "Invalid value was SET / GET for key 2");
    assert(stack[2].eq(constants[5]), "Invalid value was SET / GET for key 3");
  });

  it("should set and get values of different types", async () => {
    // Numeric values
    const key = 123;
    const val = 456;

    const constants1 = [key, val];

    // prettier-ignore
    const source1 = concat([
        // SET
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // key
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // val
      op(Opcode.SET),
        // GET
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // key
      op(Opcode.GET),
    ]);

    let { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy({
        sources: [source1],
        constants: constants1,
      });

    // Eval
    await consumerLogic.eval(interpreter.address, dispatch, [[]]);

    const stack1 = await consumerLogic.stack();

    // StackTop
    const val1_ = stack1[stack1.length - 1];

    assert(val1_.eq(val), "Invalid value was SET / GET");

    // Hashed Key Value pair
    const hashedKey = keccak256(randomBytes(32));
    const hashedValue = keccak256(randomBytes(256));
    const constants2 = [hashedKey, hashedValue];

    // prettier-ignore
    const source2 = concat([
        // SET
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // key
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // val
      op(Opcode.SET),
        // GET
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // key
      op(Opcode.GET),
    ]);

    ({ consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy({
        sources: [source2],
        constants: constants2,
      }));

    // Eval
    await consumerLogic.eval(interpreter.address, dispatch, [[]]);

    const stack2 = await consumerLogic.stack();

    const val2_ = stack2[stack2.length - 1];

    // StackTop
    assert(
      val2_.eq(hashedValue),
      "Invalid value was SET / GET for hashed bytes"
    );

    // max numeric key value pair
    const maxKey = ethers.constants.MaxUint256;
    const maxValue = ethers.constants.MaxUint256;
    const constants3 = [maxKey, maxValue];

    // prettier-ignore
    const source3 = concat([
        // SET
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // key
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // val
      op(Opcode.SET),
        // GET
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // key
      op(Opcode.GET),
    ]);

    ({ consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy({
        sources: [source3],
        constants: constants3,
      }));

    // Eval
    await consumerLogic.eval(interpreter.address, dispatch, [[]]);

    const stack3 = await consumerLogic.stack();

    const val3_ = stack3[stack3.length - 1];

    // StackTop
    assert(
      val3_.eq(maxValue),
      "Invalid value was SET / GET for max key value pair"
    );
    const signers = await ethers.getSigners();
    // address key value pair
    const addressKey = signers[0].address;
    const addressValue = signers[1].address;
    const constants4 = [addressKey, addressValue];

    // prettier-ignore
    const source4 = concat([
        // SET
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // key
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // val
      op(Opcode.SET),
        // GET
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // key
      op(Opcode.GET),
    ]);

    ({ consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy({
        sources: [source4],
        constants: constants4,
      }));

    // Eval
    await consumerLogic.eval(interpreter.address, dispatch, [[]]);

    const stack4 = await consumerLogic.stack();

    const val4_ = stack4[stack4.length - 1];

    // StackTop
    assert(
      val4_.eq(addressValue),
      "Invalid value was SET / GET for string key value pair"
    );
  });

  it("should set a value", async () => {
    const key = 123;
    const val = 456;

    const constants = [key, val];

    // prettier-ignore
    const source = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // key
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // val
      op(Opcode.SET),
    ]);

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy({
        sources: [source],
        constants,
      });

    // Eval
    await consumerLogic.eval(interpreter.address, dispatch, [[]]);

    const stateChanges = await consumerLogic["stateChanges()"]();

    // StackTop
    const key_ = stateChanges[0];
    const val_ = stateChanges[1];

    assert(key_.eq(key), "Invalid key");
    assert(val_.eq(val), "Invalid value");
  });   


  // it("should set a key value pair and overwrite it", async () => {
  //   const key1 = 100;
  //   const key2 = 200;

  //   const val1 = ethers.constants.MaxUint256;
  //   const val2 = 555;

  //   const constants = [key1, val1, key2 ];

  //   // prettier-ignore
  //   const source = concat([
  //       // SET key1
  //       op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // key
  //       op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // val
  //     op(Opcode.SET),

  //       // GET KEY 1
  //       op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // key
  //     op(Opcode.GET),
      
      
      
  //       // GET KEY 1
  //       op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2 )), // key
  //     op(Opcode.GET),
      
  //   ]);

  //   const { consumerLogic, interpreter, dispatch } =
  //     await iinterpreterV1ConsumerDeploy({
  //       sources: [source],
  //       constants,
  //     });

  //   // Eval
  //   await consumerLogic.eval(interpreter.address, dispatch, [[]]);

  //   const stack = await consumerLogic.stack(); 
    
  //   console.log("stack : " , stack )

  //   // assert(stack.length == 2, "Invalid stack length");
  //   // assert(stack[0].eq(constants[1]), "Invalid value was SET / GET for key 1");
  //   // assert(stack[1].eq(constants[2]), "Invalid value was SET / GET for key 1"); 


  // });



}); 


describe.only("SET/GET Opcode tests with eval namespace", async function () { 
  
  let rainInterpreter: Rainterpreter; 
  let consumerLogic : IInterpreterV1Consumer
  let consumerLogicB : IInterpreterV1Consumer 


  before(async () => { 
    rainInterpreter = await rainterpreterDeploy();  
    const consumerFactory = await ethers.getContractFactory("IInterpreterV1Consumer"); 
    
    consumerLogic = (await consumerFactory.deploy()) as IInterpreterV1Consumer;
    await consumerLogic.deployed();  

    consumerLogicB = (await consumerFactory.deploy()) as IInterpreterV1Consumer;
    await consumerLogicB.deployed(); 

  }); 

  it("should set a key value pair and overwrite it", async () => {
    const key1 = 100;
    const key2 = 200;
    const val1 = 901
    const val2 = 902



    const constantsA = [key1, val1 ];

    // prettier-ignore
    const sourceA = concat([
        // SET key1
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // key
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // val
      op(Opcode.SET),

        // GET KEY 1
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // key
      op(Opcode.GET),
    ]);

    const expressionA =
      await expressionDeployConsumer({
        sources: [sourceA],
        constants : constantsA,
      } , rainInterpreter);

    // Eval
    await consumerLogic.eval(rainInterpreter.address, expressionA.dispatch, [[]]);

    const stackA = await consumerLogic.stack(); 
    
    console.log("stackA : " , stackA ) 


    const constantsB = [key2 , val2 ];

    // prettier-ignore
    const sourceB = concat([
        
        // SET key1
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // key
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // val
        op(Opcode.SET),

        // GET KEY 1
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // key
        op(Opcode.GET),

      
    ]);

    const expressionB =
      await expressionDeployConsumer({
        sources: [sourceB],
        constants : constantsB,
      } , rainInterpreter);

    // Eval
    await consumerLogic.eval(rainInterpreter.address, expressionB.dispatch, [[]]);

    const stackB = await consumerLogic.stack(); 
    
    console.log("stackB : " , stackB ) 

    const stateChanges = await consumerLogic["stateChanges()"]();  

    console.log("stateChanges : " , stateChanges ) 

    


  });
  

  it.only("should set a value with same key in same namespace for different callers", async () => { 

    const key = 123;
    const val1 = 456; 
    const val2 = 789; 
    const namespace = 363

    const constantsA = [key, val1];
    const constantsB = [key, val2];

    // prettier-ignore
    const sourceA = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // key
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // val
      op(Opcode.SET),
    ]);

    const expressionA =await expressionDeployConsumer(
         {
            sources: [sourceA],
            constants: constantsA
         } ,
         rainInterpreter 
      );

    await consumerLogic.evalWithNamespace(rainInterpreter.address, namespace,  expressionA.dispatch, [[]]);

    const stateChangesA = await consumerLogic["stateChanges()"](); 
   
     // StackTop
    const keyA = stateChangesA[0];
    const valA = stateChangesA[1];

    assert(keyA.eq(key), "Invalid key");
    assert(valA.eq(val1), "Invalid value");

    // prettier-ignore
    const sourceB = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // key
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // val
      op(Opcode.SET),
    ]);  

    let expressionB = await expressionDeployConsumer(
      {
        sources: [sourceB],
        constants: constantsB,
      } ,
      rainInterpreter 
   );  

    await consumerLogic.evalWithNamespace(rainInterpreter.address, namespace,  expressionB.dispatch, [[]]);

    const stateChangesB = await consumerLogic["stateChanges()"]();   


    // StackTop
    const keyB = stateChangesB[0];
    const valB = stateChangesB[1];

    assert(keyB.eq(key), "Invalid key");
    assert(valB.eq(val2), "Invalid value");


  });    


  


});
