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

    const checkValue = concat([
      op(Opcode.DEBUG, Debug.Stack), // Should show the new stack
      op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)),
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)),
      op(Opcode.LESS_THAN),
    ]);

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
});
