import * as Util from "../Util";
import chai from "chai";
import { ethers } from "hardhat";
import { concat } from "ethers/lib/utils";
import { op } from "../Util";
import type { BigNumber, Contract } from "ethers";

import type { LogicTest } from "../../typechain/LogicTest";

const { assert } = chai;

const enum Opcode {
  SKIP,
  VAL,
  DUP,
  ZIPMAP,
  IS_ZERO,
  EAGER_IF,
  EQUAL_TO,
  LESS_THAN,
  GREATER_THAN,
  EVERY,
  ANY,
}

const isTruthy = (vmValue: BigNumber) => vmValue.eq(1);

describe("LogicOps", async function () {
  it("should check whether any value in a list is non-zero", async () => {
    this.timeout(0);

    const logicFactory = await ethers.getContractFactory("LogicTest");

    const constants = [0, 1, 2, 3];

    const v0 = op(Opcode.VAL, 0);
    const v1 = op(Opcode.VAL, 1);
    const v2 = op(Opcode.VAL, 2);
    const v3 = op(Opcode.VAL, 3);

    // prettier-ignore
    const source0 = concat([
      v1,
      v2,
      v3,
      op(Opcode.ANY, 3),
    ]);

    const logic0 = (await logicFactory.deploy({
      sources: [source0],
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as LogicTest & Contract;

    const result0 = await logic0.run();

    assert(result0.eq(1), `returned wrong value from any, got ${result0}`);

    // prettier-ignore
    const source1 = concat([
      v0,
      v0,
      op(Opcode.ANY, 2),
    ]);

    const logic1 = (await logicFactory.deploy({
      sources: [source1],
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as LogicTest & Contract;

    const result1 = await logic1.run();

    assert(result1.isZero(), `returned wrong value from any, got ${result1}`);

    // prettier-ignore
    const source2 = concat([
      v0,
      v0,
      v3,
      op(Opcode.ANY, 3),
    ]);

    const logic2 = (await logicFactory.deploy({
      sources: [source2],
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as LogicTest & Contract;

    const result2 = await logic2.run();

    assert(result2.eq(3), `returned wrong value from any, got ${result2}`);
  });

  it("should check whether every value in a list is non-zero", async () => {
    this.timeout(0);

    const logicFactory = await ethers.getContractFactory("LogicTest");

    const constants = [0, 1, 2, 3];

    const v0 = op(Opcode.VAL, 0);
    const v1 = op(Opcode.VAL, 1);
    const v2 = op(Opcode.VAL, 2);
    const v3 = op(Opcode.VAL, 3);

    // prettier-ignore
    const source0 = concat([
      v1,
      v2,
      v3,
      op(Opcode.EVERY, 3),
    ]);

    const logic0 = (await logicFactory.deploy({
      sources: [source0],
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as LogicTest & Contract;

    const result0 = await logic0.run();

    assert(result0.eq(1), `returned wrong value from every, got ${result0}`);

    // prettier-ignore
    const source1 = concat([
      v0,
      v1,
      v2,
      op(Opcode.EVERY, 3),
    ]);

    const logic1 = (await logicFactory.deploy({
      sources: [source1],
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as LogicTest & Contract;

    const result1 = await logic1.run();

    assert(result1.isZero(), `returned wrong value from every, got ${result1}`);

    // prettier-ignore
    const source2 = concat([
      v0,
      v3,
      op(Opcode.EVERY, 2),
    ]);

    const logic2 = (await logicFactory.deploy({
      sources: [source2],
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as LogicTest & Contract;

    const result2 = await logic2.run();

    assert(result2.isZero(), `returned wrong value from every, got ${result2}`);
  });

  it("should perform ternary 'eager if' operation on 3 values on the stack", async () => {
    this.timeout(0);

    const logicFactory = await ethers.getContractFactory("LogicTest");

    const constants = [0, 1, 2, 3];

    const v0 = op(Opcode.VAL, 0);
    const v1 = op(Opcode.VAL, 1);
    const v2 = op(Opcode.VAL, 2);
    const v3 = op(Opcode.VAL, 3);

    // prettier-ignore
    const source0 = concat([
      // 1 ? 2 : 3
      v1,
      v2,
      v3,
      op(Opcode.EAGER_IF),
    ]);

    const logic0 = (await logicFactory.deploy({
      sources: [source0],
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as LogicTest & Contract;

    const result0 = await logic0.run();

    assert(result0.eq(2), `returned wrong value from eager if, got ${result0}`);

    // prettier-ignore
    const source1 = concat([
      // 2 ? 2 : 3
      v2,
      v2,
      v3,
      op(Opcode.EAGER_IF),
    ]);

    const logic1 = (await logicFactory.deploy({
      sources: [source1],
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as LogicTest & Contract;

    const result1 = await logic1.run();

    assert(result1.eq(2), `returned wrong value from eager if, got ${result1}`);

    // prettier-ignore
    const source2 = concat([
      // 2 ? 2 : 3
      v0,
      v2,
      v3,
      op(Opcode.EAGER_IF),
    ]);

    const logic2 = (await logicFactory.deploy({
      sources: [source2],
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as LogicTest & Contract;

    const result2 = await logic2.run();

    assert(result2.eq(3), `returned wrong value from eager if, got ${result2}`);
  });

  it("should check that value is greater than another value", async () => {
    this.timeout(0);

    const logicFactory = await ethers.getContractFactory("LogicTest");

    const constants = [1, 2];

    // prettier-ignore
    const source0 = concat([
      op(Opcode.VAL, 1), // 2
      op(Opcode.VAL, 0), // 1
      op(Opcode.GREATER_THAN),
    ]);

    const logic0 = (await logicFactory.deploy({
      sources: [source0],
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as LogicTest & Contract;

    const result0 = await logic0.run(); // expect 1

    assert(isTruthy(result0), "wrongly says 2 is not gt 1");

    // prettier-ignore
    const source1 = concat([
      op(Opcode.VAL, 0), // 1
      op(Opcode.VAL, 1), // 2
      op(Opcode.GREATER_THAN),
    ]);

    const logic1 = (await logicFactory.deploy({
      sources: [source1],
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as LogicTest & Contract;

    const result1 = await logic1.run(); // expect 0

    assert(!isTruthy(result1), "wrongly says 1 is gt 2");
  });

  it("should check that value is less than another value", async () => {
    this.timeout(0);

    const logicFactory = await ethers.getContractFactory("LogicTest");

    const constants = [1, 2];

    // prettier-ignore
    const source0 = concat([
      op(Opcode.VAL, 1), // 2
      op(Opcode.VAL, 0), // 1
      op(Opcode.LESS_THAN),
    ]);

    const logic0 = (await logicFactory.deploy({
      sources: [source0],
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as LogicTest & Contract;

    const result0 = await logic0.run(); // expect 0

    assert(!isTruthy(result0), "wrongly says 2 is lt 1");

    // prettier-ignore
    const source1 = concat([
      op(Opcode.VAL, 0), // 1
      op(Opcode.VAL, 1), // 2
      op(Opcode.LESS_THAN),
    ]);

    const logic1 = (await logicFactory.deploy({
      sources: [source1],
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as LogicTest & Contract;

    const result1 = await logic1.run(); // expect 1

    assert(isTruthy(result1), "wrongly says 1 is not lt 2");
  });

  it("should check that values are equal to each other", async () => {
    this.timeout(0);

    const logicFactory = await ethers.getContractFactory("LogicTest");

    const constants = [1, 2];

    // prettier-ignore
    const source0 = concat([
      op(Opcode.VAL, 1), // 2
      op(Opcode.VAL, 1), // 2
      op(Opcode.EQUAL_TO),
    ]);

    const logic0 = (await logicFactory.deploy({
      sources: [source0],
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as LogicTest & Contract;

    const result0 = await logic0.run(); // expect 1

    assert(isTruthy(result0), "wrongly says 2 is not equal to 2");

    // prettier-ignore
    const source1 = concat([
      op(Opcode.VAL, 0), // 1
      op(Opcode.VAL, 1), // 2
      op(Opcode.EQUAL_TO),
    ]);

    const logic1 = (await logicFactory.deploy({
      sources: [source1],
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as LogicTest & Contract;

    const result1 = await logic1.run(); // expect 0

    assert(!isTruthy(result1), "wrongly says 1 is equal to 2");
  });

  it("should check that a value is zero", async () => {
    this.timeout(0);

    const logicFactory = await ethers.getContractFactory("LogicTest");

    const constants = [0, 1];

    // prettier-ignore
    const source0 = concat([
      op(Opcode.VAL, 0),
      op(Opcode.IS_ZERO),
    ]);

    const logic0 = (await logicFactory.deploy({
      sources: [source0],
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as LogicTest & Contract;

    const result0 = await logic0.run(); // expect 1

    assert(isTruthy(result0), "wrongly says 0 is not zero");

    // prettier-ignore
    const source1 = concat([
      op(Opcode.VAL, 1),
      op(Opcode.IS_ZERO),
    ]);

    const logic1 = (await logicFactory.deploy({
      sources: [source1],
      constants,
      argumentsLength: 0,
      stackLength: 3,
    })) as LogicTest & Contract;

    const result1 = await logic1.run(); // expect 0

    assert(!isTruthy(result1), "wrongly says 1 is zero");
  });
});
