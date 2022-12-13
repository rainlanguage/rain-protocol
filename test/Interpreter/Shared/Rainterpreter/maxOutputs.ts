import { assert } from "chai";
import { concat } from "ethers/lib/utils";

import {
  memoryOperand,
  MemoryType,
  op,
  RainterpreterOps,
} from "../../../../utils";
import { iinterpreterV1ConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { compareArrays } from "../../../../utils/test/compareArrays";

const Opcode = RainterpreterOps;

describe("Rainterpreter maxOutputs test", async function () {
  it("ensure that max outputs caps the number of values that can be returned from the interpreter so that longer stacks are truncated to their ends", async () => {
    // basic check
    let maxOutputs = 3;
    const constants = [0, 1, 2, 3, 4, 5];

    // prettier-ignore
    const source1 = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 4)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 5)),
    ]);

    let { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(
        {
          sources: [source1],
          constants,
        },
        maxOutputs
      );

    // Eval
    await consumerLogic.eval(interpreter.address, dispatch, [[]]);

    // Asserting stack
    const stack1 = await consumerLogic.stack();
    assert(
      stack1.length == maxOutputs,
      `Invalid stack length, expected ${maxOutputs} actual ${stack1.length}`
    );
    compareArrays(stack1, constants.slice(constants.length - maxOutputs));

    // minimum value check
    maxOutputs = 0;
    // prettier-ignore
    const source2 = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)),
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)),
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 4)),
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 5)),
  ]);

    ({ consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(
        {
          sources: [source2],
          constants,
        },
        maxOutputs
      ));

    // Eval
    await consumerLogic.eval(interpreter.address, dispatch, [[]]);

    // Asserting stack
    const stack2 = await consumerLogic.stack();
    assert(
      stack2.length == maxOutputs,
      `Invalid stack length, expected ${maxOutputs} actual ${stack2.length}`
    );
    compareArrays(stack2, constants.slice(constants.length - maxOutputs));

    // minimum value check
    maxOutputs = 255;
    const maxConstants = new Array(300).fill(1);
    // prettier-ignore
    const source3 = concat(new Array(300).fill(op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0))));

    ({ consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(
        {
          sources: [source3],
          constants: maxConstants,
        },
        maxOutputs
      ));

    // Eval
    await consumerLogic.eval(interpreter.address, dispatch, [[]]);

    // Asserting stack
    const stack3 = await consumerLogic.stack();
    assert(
      stack3.length == maxOutputs,
      `Invalid stack length, expected ${maxOutputs} actual ${stack3.length}`
    );

    compareArrays(stack3, maxConstants.slice(maxConstants.length - maxOutputs));
  });
});
