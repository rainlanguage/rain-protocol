import { concat } from "ethers/lib/utils";
import type { AllStandardOpsTest } from "../../../../typechain";
import { allStandardOpsDeploy } from "../../../../utils/deploy/test/allStandardOps/deploy";
import {
  Debug,
  foldContextOperand,
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../../utils/interpreter/ops/allStandardOps";

const Opcode = AllStandardOps;

describe("RainInterpreter FOLD_CONTEXT", async function () {
  let logic: AllStandardOpsTest;

  before(async () => {
    logic = await allStandardOpsDeploy();
  });

  it("should work", async () => {
    const constants = [0];
    const sourceIndex = 1;
    const column = 0;
    const width = 2;
    const inputSize = 1; // Accummulator size
    // prettier-ignore
    const sourceMain = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // acc
        op(Opcode.FOLD_CONTEXT, foldContextOperand(sourceIndex, column, width, inputSize)),
      op(Opcode.DEBUG, Debug.StatePacked),
    ]);

    const sourceAdd = concat([op(Opcode.ADD, width + inputSize)]);

    await logic.initialize(
      {
        sources: [sourceMain, sourceAdd],
        constants,
      },
      [1]
    );

    const context = [
      [10, 20, 30, 40],
      [100, 200, 300, 400],
      [1000, 2000, 3000, 4000],
      [5, 6, 7, 8],
    ];

    await logic["runContext(uint256[][])"](context);
    const result = await logic.stack();
    console.log(result);
  });
});
