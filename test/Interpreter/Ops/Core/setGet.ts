import { concat } from "ethers/lib/utils";
import type { AllStandardOpsTest } from "../../../../typechain";
import {
  memoryOperand,
  MemoryType,
  op,
  RainterpreterOps,
} from "../../../../utils";
import { allStandardOpsDeploy } from "../../../../utils/deploy/test/allStandardOps/deploy";

const Opcode = RainterpreterOps;

describe("SET/GET Opcode tests", async function () {
  let logic: AllStandardOpsTest;

  before(async () => {
    logic = await allStandardOpsDeploy();
  });

  it.only("should set and get a value", async () => {
    const key = 123;
    const val = 456;

    const constants = [key, val];

    // prettier-ignore
    const sourceSET = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // key
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // val
      op(Opcode.SET),
    ]);
    // prettier-ignore
    const sourceGET = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // key
      op(Opcode.GET),
    ]);

    await logic.initialize(
      {
        sources: [sourceSET, sourceGET],
        constants,
      },
      [0, 1]
    );

    await logic["run(uint256)"](0);

    await logic["run(uint256)"](1);
    const result0 = await logic.stackTop();
    console.log({ result0 });
  });

  it("should set a value", async () => {
    const key = 123;
    const val = 456;

    const constants = [key, val];

    // prettier-ignore
    const sourceSET = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // key
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // val
      op(Opcode.SET),
    ]);
    await logic.initialize(
      {
        sources: [sourceSET],
        constants,
      },
      [0]
    );

    await logic["run(uint256)"](0);
  });
});
