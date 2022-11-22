import { concat } from "ethers/lib/utils";
import type { AllStandardOpsStandaloneTest } from "../../../../typechain";
import {
  memoryOperand,
  MemoryType,
  op,
  RainterpreterOps,
} from "../../../../utils";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployer } from "../../../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import { allStandardOpsStandaloneDeploy } from "../../../../utils/deploy/test/allStandardOps/deploy";

const Opcode = RainterpreterOps;

describe("SET/GET Opcode tests", async function () {
  let logic: AllStandardOpsStandaloneTest;

  before(async () => {
    logic = await allStandardOpsStandaloneDeploy();
  });

  it("should set and get a value", async () => {
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

    const interpreter = await rainterpreterDeploy();
    const expressionDeployer = await rainterpreterExpressionDeployer(
      interpreter
    );

    await logic.initialize(
      {
        sources: [sourceSET, sourceGET],
        constants,
      },
      interpreter.address,
      expressionDeployer.address,
      [0, 1]
    );

    await logic["run(uint256)"](1);
    const result0 = await logic.stackTop();
    console.log({ result0 });

    await logic["run(uint256)"](0);

    await logic["run(uint256)"](1);
    const result1 = await logic.stackTop();
    console.log({ result1 });
  });
});
