import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { StandardIntegrity } from "../../../../typechain/StandardIntegrity";
import { AllStandardOpsTest } from "../../../../typechain/AllStandardOpsTest";
import { AllStandardOps } from "../../../../utils/rainvm/ops/allStandardOps";
import {
  Debug,
  op,
  memoryOperand,
  MemoryType,
  callOperand,
  loopNOperand,
} from "../../../../utils/rainvm/vm";

const Opcode = AllStandardOps;

describe("RainVM debug op", async function () {
  let integrity: StandardIntegrity;
  let logic: AllStandardOpsTest;

  before(async () => {
    const integrityFactory = await ethers.getContractFactory(
      "StandardIntegrity"
    );
    integrity = (await integrityFactory.deploy()) as StandardIntegrity;
    await integrity.deployed();

    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
    logic = (await logicFactory.deploy(
      integrity.address
    )) as AllStandardOpsTest;
  });

  it("should log stack when DEBUG operand is set to DEBUG_STACK", async () => {
    const constants = [10, 20];

    // prettier-ignore
    const sources = [concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.ADD, 2),
      op(Opcode.DEBUG, Debug.Stack),
    ])];

    await logic.initialize({ sources, constants });
    await logic.run();

    assert(true); // you have to check this log yourself
  });

  it("should log packed state when DEBUG operand is set to DEBUG_STATE_PACKED", async () => {
    const constants = [10, 20];

    // prettier-ignore
    const sources = [concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.ADD, 2),
      op(Opcode.DEBUG, Debug.StatePacked),
    ])];

    await logic.initialize({ sources, constants });
    await logic.run();

    assert(true); // you have to check this log yourself
  });

  it("should be able to log when is used within a source from CALL op", async () => {
    const constants = [0, 1, 20];

    // prettier-ignore
    const checkValue = concat([
      op(Opcode.DEBUG, Debug.Stack), // Should show the new stack
        op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)),
      op(Opcode.LESS_THAN),
    ]);

    // prettier-ignore
    const source = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.DEBUG, Debug.Stack), // Should show the stack here
      op(Opcode.CALL, callOperand(1, 1, 1)),
      op(Opcode.DEBUG, Debug.Stack), // Should show the stack here
    ]);

    await logic.initialize({
      sources: [source, checkValue],
      constants,
    });

    await logic.run();
  });

  it("should be able to log when is used within a source from DO_WHILE op", async () => {
    const constants = [3, 2, 7];

    // prettier-ignore
    const sourceMAIN = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)),
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)),
        op(Opcode.LESS_THAN),
      op(Opcode.DO_WHILE, 1), // Source to run is on index 1
    ]);

    // prettier-ignore
    const sourceWHILE = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.ADD, 2),
        op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)),
      op(Opcode.LESS_THAN),
      op(Opcode.DEBUG, Debug.Stack),
    ]);

    await logic.initialize({
      sources: [sourceMAIN, sourceWHILE],
      constants,
    });

    await logic.run();
  });

  it("should be able to log when is used within a source from LOOP_N op", async () => {
    const n = 5;
    const initialValue = 2;
    const incrementValue = 1;

    const constants = [initialValue, incrementValue];

    // prettier-ignore
    const sourceADD = concat([
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
        op(Opcode.ADD, 2),
        op(Opcode.DEBUG, Debug.Stack),
      ]);

    // prettier-ignore
    const sourceMAIN = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.LOOP_N, loopNOperand(n, 1))
    ]);

    await logic.initialize({
      sources: [sourceMAIN, sourceADD],
      constants,
    });

    let expectedResult = initialValue;
    for (let i = 0; i < n; i++) {
      expectedResult += incrementValue;
    }

    await logic.run();
    const result0 = await logic.stackTop();
    assert(
      result0.eq(expectedResult),
      `Invalid output, expected ${expectedResult}, actual ${result0}`
    );
  });
});
