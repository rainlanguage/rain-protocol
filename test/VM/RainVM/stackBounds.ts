import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { AllStandardOpsStateBuilder } from "../../../typechain/AllStandardOpsStateBuilder";
import { AllStandardOpsTest } from "../../../typechain/AllStandardOpsTest";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { op, zipmapSize } from "../../../utils/rainvm/vm";
import { assertError } from "../../../utils/test/assertError";

const Opcode = AllStandardOps;
describe("RainVM stack bounds", async function () {
  let stateBuilder: AllStandardOpsStateBuilder;
  let logic: AllStandardOpsTest;

  before(async () => {
    this.timeout(0);
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

  it("should error when script references out-of-bounds opcode", async () => {
    this.timeout(0);

    const constants = [];

    const sources = [concat([op(99)])];

    await assertError(
      async () => await logic.initialize({ sources, constants }),
      "MAX_OPCODE",
      "did not error when script references out-of-bounds opcode"
    );
  });

  it("should error when trying to read an out-of-bounds argument", async () => {
    this.timeout(0);

    const constants = [1, 2, 3];
    const v1 = op(Opcode.CONSTANT, 0);
    const v2 = op(Opcode.CONSTANT, 1);
    const v3 = op(Opcode.CONSTANT, 2);

    const a0 = op(Opcode.CONSTANT, 3);
    const a1 = op(Opcode.CONSTANT, 4);
    const aOOB = op(Opcode.CONSTANT, 6);

    // zero-based counting
    const sourceIndex = 1; // 1
    const loopSize = 0; // 1
    const valSize = 2; // 3

    // prettier-ignore
    const sources = [
      concat([
          v1,
          v2,
          v3,
        op(Opcode.ZIPMAP, zipmapSize(sourceIndex, loopSize, valSize)),
      ]),
      concat([
        // (arg0 arg1 arg2 add)
          a0,
          a1,
          aOOB,
        op(Opcode.ADD, 3),
      ]),
    ];

    await assertError(
      async () => await logic.initialize({ sources, constants }),
      "", // there is at least an error
      "did not error when trying to read an out-of-bounds argument"
    );
  });

  it("should error when trying to read an out-of-bounds constant", async () => {
    this.timeout(0);

    const constants = [1];
    const vOOB = op(Opcode.CONSTANT, 1);

    const sources = [concat([vOOB])];

    await assertError(
      async () => await logic.initialize({ sources, constants }),
      "", // there is at least an error
      "did not error when trying to read an out-of-bounds constant"
    );
  });

  it("should prevent bad RainVM script attempting to access stack index out of bounds (underflow)", async () => {
    this.timeout(0);

    const constants = [0, 1];
    const v0 = op(Opcode.CONSTANT, 0);
    const v1 = op(Opcode.CONSTANT, 1);

    // prettier-ignore
    const sources = [
      concat([
          v0,
          v1,
        op(Opcode.EAGER_IF),
      ]),
    ];

    await assertError(
      async () => await logic.initialize({ sources, constants }),
      "MAX_STACK",
      "did not prevent bad RainVM script accessing stack index out of bounds"
    );
  });

  it("should prevent bad RainVM script attempting to access stack index out of bounds (overflow)", async () => {
    this.timeout(0);

    const constants = [3, 2, 1];
    const v3 = op(Opcode.CONSTANT, 0);
    const v2 = op(Opcode.CONSTANT, 1);
    const v1 = op(Opcode.CONSTANT, 2);

    // prettier-ignore
    const sources = [
      concat([
        // (1 2 3 +)
          v1,
          v2,
          v3,
        op(Opcode.ADD, 4),
      ]),
    ];

    await assertError(
      async () => await logic.initialize({ sources, constants }),
      "MAX_STACK",
      "did not prevent bad RainVM script accessing stack index out of bounds"
    );
  });
});
