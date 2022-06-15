import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { AllStandardOpsStateBuilder } from "../../../typechain/AllStandardOpsStateBuilder";
import { AllStandardOpsTest } from "../../../typechain/AllStandardOpsTest";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { Debug, op } from "../../../utils/rainvm/vm";

const Opcode = AllStandardOps;

describe("RainVM debug op", async function () {
  let stateBuilder: AllStandardOpsStateBuilder;
  let logic: AllStandardOpsTest;

  before(async () => {
    const stateBuilderFactory = await ethers.getContractFactory(
      "AllStandardOpsStateBuilder"
    );
    stateBuilder =
      (await stateBuilderFactory.deploy()) as AllStandardOpsStateBuilder;
    await stateBuilder.deployed();

    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
    logic = (await logicFactory.deploy(
      stateBuilder.address
    )) as AllStandardOpsTest;
  });

  it("should log stack index when DEBUG operand is set to DEBUG_STACK_INDEX", async () => {
    const constants = [10, 20];

    // prettier-ignore
    const sources = [concat([
        op(Opcode.CONSTANT, 0),
        op(Opcode.CONSTANT, 1),
      op(Opcode.ADD, 2),
      op(Opcode.DEBUG, Debug.StackIndex),
    ])];

    await logic.initialize({ sources, constants });
    await logic.run();

    assert(true); // you have to check this log yourself
  });

  it("should log stack when DEBUG operand is set to DEBUG_STACK", async () => {
    const constants = [10, 20];

    // prettier-ignore
    const sources = [concat([
        op(Opcode.CONSTANT, 0),
        op(Opcode.CONSTANT, 1),
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
        op(Opcode.CONSTANT, 0),
        op(Opcode.CONSTANT, 1),
      op(Opcode.ADD, 2),
      op(Opcode.DEBUG, Debug.StatePacked),
    ])];

    await logic.initialize({ sources, constants });
    await logic.run();

    assert(true); // you have to check this log yourself
  });

  it("should log state as bytes when DEBUG operand is set to DEBUG_STATE_ABI", async () => {
    const constants = [10, 20];

    // prettier-ignore
    const sources = [concat([
        op(Opcode.CONSTANT, 0),
        op(Opcode.CONSTANT, 1),
      op(Opcode.ADD, 2),
      op(Opcode.DEBUG, Debug.StateAbi),
    ])];

    await logic.initialize({ sources, constants });
    await logic.run();

    assert(true); // you have to check this log yourself
  });
});
