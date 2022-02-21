// import * as Util from "../Util";
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
  EQUAL_TO,
  LESS_THAN,
  GREATER_THAN,
}

const isTruthy = (vmValue: BigNumber) => vmValue.eq(1);

describe("LogicOps", async function () {
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
      argumentsLength: 1,
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
      argumentsLength: 1,
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
      argumentsLength: 1,
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
      argumentsLength: 1,
      stackLength: 3,
    })) as LogicTest & Contract;

    const result1 = await logic1.run(); // expect 0

    assert(!isTruthy(result1), "wrongly says 1 is zero");
  });
});
