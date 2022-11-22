import { assert } from "chai";
import type { BigNumber } from "ethers";
import { concat, hexZeroPad } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { AllStandardOpsTest } from "../../../../typechain";
import {
  AllStandardOps,
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils";
import { allStandardOpsDeploy } from "../../../../utils/deploy/test/allStandardOps/deploy";

const Opcode = AllStandardOps;

const isTruthy = (interpreterValue: BigNumber) => !interpreterValue.isZero();

describe("RainInterpreter logic ops", async function () {
  let logic: AllStandardOpsTest;

  before(async () => {
    logic = await allStandardOpsDeploy();
  });

  // it("should support logic ops within a zipmap loop", async function () {
  //   const report = paddedUInt256(
  //     ethers.BigNumber.from(
  //       "0x" +
  //         paddedUInt32(1) +
  //         paddedUInt32(0) +
  //         paddedUInt32(3) +
  //         paddedUInt32(0) +
  //         paddedUInt32(5) +
  //         paddedUInt32(0) +
  //         paddedUInt32(7) +
  //         paddedUInt32(8)
  //     )
  //   );

  //   const reportMax = max_uint256;

  //   const constants = [report, reportMax];

  //   const vReport = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0));
  //   const vReportMax = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1));

  //   // BEGIN zipmap args

  //   const argReport = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2));
  //   const argReportMax = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3));

  //   // END zipmap args

  //   // prettier-ignore
  //   const ZIPMAP_FN = () =>
  //     concat([
  //           argReport,
  //         op(Opcode.ISZERO),
  //         argReportMax,
  //         argReport,
  //       op(Opcode.EAGER_IF),
  //     ]);

  //   // prettier-ignore
  //   const SOURCE = () =>
  //     concat([
  //         vReport,
  //         vReportMax,
  //       op(Opcode.ZIPMAP, zipmapSize(1, 3, 1)),
  //     ]);

  //   await logic.initialize({ sources: [SOURCE(), ZIPMAP_FN()], constants });

  //   await logic["run()"]();

  //   const result = await logic.state();

  //   const resultReport = ethers.BigNumber.from(
  //     "0x" +
  //       paddedUInt32(result.stack[7]) +
  //       paddedUInt32(result.stack[6]) +
  //       paddedUInt32(result.stack[5]) +
  //       paddedUInt32(result.stack[4]) +
  //       paddedUInt32(result.stack[3]) +
  //       paddedUInt32(result.stack[2]) +
  //       paddedUInt32(result.stack[1]) +
  //       paddedUInt32(result.stack[0])
  //   );

  //   const expectedReport = paddedUInt256(
  //     ethers.BigNumber.from(
  //       "0x" +
  //         paddedUInt32(1) +
  //         paddedUInt32("0xffffffff") +
  //         paddedUInt32(3) +
  //         paddedUInt32("0xffffffff") +
  //         paddedUInt32(5) +
  //         paddedUInt32("0xffffffff") +
  //         paddedUInt32(7) +
  //         paddedUInt32(8)
  //     )
  //   );

  //   assert(
  //     resultReport.eq(expectedReport),
  //     `wrong calculation result
  //     expected  ${hexlify(expectedReport)}
  //     got       ${hexlify(resultReport)}`
  //   );
  // });

  it("should check whether any value in a list is non-zero", async () => {
    const constants = [0, 1, 2, 3];

    const v0 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0));
    const v1 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1));
    const v2 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2));
    const v3 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3));

    // prettier-ignore
    const source0 = concat([
        v1,
        v2,
        v3,
      op(Opcode.ANY, 3),
    ]);

    await logic.initialize(
      {
        sources: [source0],
        constants,
      },
      [1]
    );
    await logic["run()"]();
    const result0 = await logic.stackTop();

    assert(result0.eq(1), `returned wrong value from any, got ${result0}`);

    // prettier-ignore
    const source1 = concat([
        v0,
        v0,
      op(Opcode.ANY, 2),
    ]);

    await logic.initialize(
      {
        sources: [source1],
        constants,
      },
      [1]
    );

    await logic["run()"]();
    const result1 = await logic.stackTop();

    assert(result1.isZero(), `returned wrong value from any, got ${result1}`);

    // prettier-ignore
    const source2 = concat([
        v0,
        v0,
        v3,
      op(Opcode.ANY, 3),
    ]);

    await logic.initialize(
      {
        sources: [source2],
        constants,
      },
      [1]
    );

    await logic["run()"]();
    const result2 = await logic.stackTop();

    assert(result2.eq(3), `returned wrong value from any, got ${result2}`);
  });

  it("should check whether every value in a list is non-zero", async () => {
    const constants = [0, 1, 2, 3];

    const v0 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0));
    const v1 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1));
    const v2 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2));
    const v3 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3));

    // prettier-ignore
    const source0 = concat([
        v1,
        v2,
        v3,
      op(Opcode.EVERY, 3),
    ]);

    await logic.initialize(
      {
        sources: [source0],
        constants,
      },
      [1]
    );
    await logic["run()"]();
    const result0 = await logic.stackTop();

    assert(result0.eq(1), `returned wrong value from every, got ${result0}`);

    // prettier-ignore
    const source1 = concat([
        v0,
        v1,
        v2,
      op(Opcode.EVERY, 3),
    ]);

    await logic.initialize(
      {
        sources: [source1],
        constants,
      },
      [1]
    );

    await logic["run()"]();
    const result1 = await logic.stackTop();

    assert(result1.isZero(), `returned wrong value from every, got ${result1}`);

    // prettier-ignore
    const source2 = concat([
        v0,
        v3,
      op(Opcode.EVERY, 2),
    ]);

    await logic.initialize(
      {
        sources: [source2],
        constants,
      },
      [1]
    );

    await logic["run()"]();
    const result2 = await logic.stackTop();

    assert(result2.isZero(), `returned wrong value from every, got ${result2}`);
  });

  it("should perform ternary 'eager if' operation on 3 values on the stack", async () => {
    const constants = [0, 1, 2, 3];

    const v0 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0));
    const v1 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1));
    const v2 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2));
    const v3 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3));

    // prettier-ignore
    const source0 = concat([
      // 1 ? 2 : 3
        v1,
        v2,
        v3,
      op(Opcode.EAGER_IF),
    ]);

    await logic.initialize(
      {
        sources: [source0],
        constants,
      },
      [1]
    );

    await logic["run()"]();
    const result0 = await logic.stackTop();

    assert(result0.eq(2), `returned wrong value from eager if, got ${result0}`);

    // prettier-ignore
    const source1 = concat([
      // 2 ? 2 : 3
        v2,
        v2,
        v3,
      op(Opcode.EAGER_IF),
    ]);

    await logic.initialize(
      {
        sources: [source1],
        constants,
      },
      [1]
    );

    await logic["run()"]();
    const result1 = await logic.stackTop();

    assert(result1.eq(2), `returned wrong value from eager if, got ${result1}`);

    // prettier-ignore
    const source2 = concat([
      // 0 ? 2 : 3
        v0,
        v2,
        v3,
      op(Opcode.EAGER_IF),
    ]);

    await logic.initialize(
      {
        sources: [source2],
        constants,
      },
      [1]
    );

    await logic["run()"]();
    const result2 = await logic.stackTop();

    assert(result2.eq(3), `returned wrong value from eager if, got ${result2}`);
  });

  it("should check that value is greater than another value", async () => {
    const constants = [1, 2];

    // prettier-ignore
    const source0 = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // 2
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // 1
      op(Opcode.GREATER_THAN),
    ]);

    await logic.initialize(
      {
        sources: [source0],
        constants,
      },
      [1]
    );

    await logic["run()"]();
    const result0 = await logic.stackTop(); // expect 1

    assert(isTruthy(result0), "wrongly says 2 is not gt 1");

    // prettier-ignore
    const source1 = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // 1
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // 2
      op(Opcode.GREATER_THAN),
    ]);

    await logic.initialize(
      {
        sources: [source1],
        constants,
      },
      [1]
    );

    await logic["run()"]();
    const result1 = await logic.stackTop(); // expect 0

    assert(!isTruthy(result1), "wrongly says 1 is gt 2");
  });

  it("should check that value is less than another value", async () => {
    const constants = [1, 2];

    // prettier-ignore
    const source0 = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // 2
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // 1
      op(Opcode.LESS_THAN),
    ]);

    await logic.initialize(
      {
        sources: [source0],
        constants,
      },
      [1]
    );

    await logic["run()"]();
    const result0 = await logic.stackTop(); // expect 0

    assert(!isTruthy(result0), "wrongly says 2 is lt 1");

    // prettier-ignore
    const source1 = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // 1
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // 2
      op(Opcode.LESS_THAN),
    ]);

    await logic.initialize(
      {
        sources: [source1],
        constants,
      },
      [1]
    );

    await logic["run()"]();
    const result1 = await logic.stackTop(); // expect 1

    assert(isTruthy(result1), "wrongly says 1 is not lt 2");
  });

  it("should check that values are equal to each other", async () => {
    const id = hexZeroPad(ethers.utils.randomBytes(32), 32);

    const constants = [1, 2, 2, id];

    // prettier-ignore
    const source0 = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // 2
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)), // also 2
      op(Opcode.EQUAL_TO),
    ]);

    await logic.initialize(
      {
        sources: [source0],
        constants,
      },
      [1]
    );

    await logic["run()"]();
    const result0 = await logic.stackTop(); // expect 1

    assert(isTruthy(result0), "wrongly says 2 is not equal to 2");

    // prettier-ignore
    const source1 = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // 1
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // 2
      op(Opcode.EQUAL_TO),
    ]);

    await logic.initialize(
      {
        sources: [source1],
        constants,
      },
      [1]
    );

    await logic["run()"]();
    const result1 = await logic.stackTop(); // expect 0

    assert(!isTruthy(result1), "wrongly says 1 is equal to 2");

    // prettier-ignore
    const source2 = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // 1
      op(Opcode.CONTEXT, 0x0000), // 1
      op(Opcode.EQUAL_TO),
    ]);

    await logic.initialize(
      {
        sources: [source2],
        constants,
      },
      [1]
    );

    await logic["run()"]Context([[1]]);
    const result2 = await logic.stackTop(); // expect 1

    assert(
      isTruthy(result2),
      "wrongly says constant 1 is not equal to context 1"
    );

    // prettier-ignore
    const source3 = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)), // id
      op(Opcode.CONTEXT, 0x0000), // id
      op(Opcode.EQUAL_TO),
    ]);

    await logic.initialize(
      {
        sources: [source3],
        constants,
      },
      [1]
    );

    await logic["run()"]Context([[id]]);
    const result3 = await logic.stackTop(); // expect 1

    assert(
      isTruthy(result3),
      "wrongly says id as constant is not equal to id as context"
    );
  });

  it("should check that a value is zero", async () => {
    const constants = [0, 1];

    // prettier-ignore
    const source0 = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.ISZERO),
    ]);

    const stateConfig0 = {
      sources: [source0],
      constants,
    };

    await logic.initialize(stateConfig0, [1]);

    await logic["run()"]();
    const result0 = await logic.stackTop(); // expect 1

    assert(isTruthy(result0), "wrongly says 0 is not zero");

    // prettier-ignore
    const source1 = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.ISZERO),
    ]);

    const stateConfig1 = {
      sources: [source1],
      constants,
    };
    await logic.initialize(stateConfig1, [1]);

    await logic["run()"]();
    const result1 = await logic.stackTop(); // expect 0

    assert(!isTruthy(result1), "wrongly says 1 is zero");
  });
});
