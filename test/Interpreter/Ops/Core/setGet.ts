import { assert } from "console";
import { concat } from "ethers/lib/utils";
import type { IInterpreterV1, IInterpreterV1Consumer, IInterpreterV1Consumer__factory } from "../../../../typechain";
import {
  memoryOperand,
  MemoryType,
  op,
  RainterpreterOps,
} from "../../../../utils";

import { iinterpreterV1ConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";

const Opcode = RainterpreterOps;

describe("SET/GET Opcode tests", async function () {

  before(async () => {});

  it("should set and get a value", async () => {

    const key = 123;
    const val = 456;

    const constants = [key, val];

    // prettier-ignore
    const source = concat([
        // SET
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // key
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // val
      op(Opcode.SET),
        // GET
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // key
      op(Opcode.GET),
    ]);

    const {consumerLogic, interpreter, dispatch} = await iinterpreterV1ConsumerDeploy({
      sources: [source],
      constants,
    });
    
    // Eval
    await consumerLogic.eval(interpreter.address, dispatch, [[]]);

    let stack = await consumerLogic.stack();

    // StackTop 
    const val_ = stack[stack.length-1];

    assert(val_.eq(val), "Invalid value was SET / GET");
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
   
    const {consumerLogic, interpreter, dispatch} = await iinterpreterV1ConsumerDeploy({
      sources: [source],
      constants,
    });

   // Eval
   await consumerLogic.eval(interpreter.address, dispatch, [[]]);

   let stateChanges = await consumerLogic["stateChanges()"]();
   
    // StackTop 
   const key_ = stateChanges[0];
   const val_ = stateChanges[1];

   assert(key_.eq(key), "Invalid key");
   assert(val_.eq(val), "Invalid value");
  });
});
