import chai from "chai";
import { ethers } from "hardhat";
import { concat } from "ethers/lib/utils";
import { op, AllStandardOps } from "../Util";
import type { BigNumber, Contract } from "ethers";
import type { AllStandardOpsTest } from "../../typechain/AllStandardOpsTest";

const { assert } = chai;

const Opcode = AllStandardOps;

const isTruthy = (vmValue: BigNumber) => vmValue.eq(1);

describe("LogicOps Test", async function () {
  it("should check whether any value in a list is non-zero", async () => {
    this.timeout(0);

    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");

    const constants = [0, 1, 2, 3];

    const v0 = op(Opcode.CONSTANT, 0);
    const v1 = op(Opcode.CONSTANT, 1);
    const v2 = op(Opcode.CONSTANT, 2);
    const v3 = op(Opcode.CONSTANT, 3);

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
    })) as AllStandardOpsTest & Contract;
    await logic0.run();
    const result0 = await logic0.stackTop();

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
    })) as AllStandardOpsTest & Contract;

    await logic1.run();
    const result1 = await logic1.stackTop();

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
    })) as AllStandardOpsTest & Contract;

    await logic2.run();
    const result2 = await logic2.stackTop();

    assert(result2.eq(3), `returned wrong value from any, got ${result2}`);
  });

  it("should check whether every value in a list is non-zero", async () => {
    this.timeout(0);

    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");

    const constants = [0, 1, 2, 3];

    const v0 = op(Opcode.CONSTANT, 0);
    const v1 = op(Opcode.CONSTANT, 1);
    const v2 = op(Opcode.CONSTANT, 2);
    const v3 = op(Opcode.CONSTANT, 3);

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
    })) as AllStandardOpsTest & Contract;

    await logic0.run();
    const result0 = await logic0.stackTop();

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
    })) as AllStandardOpsTest & Contract;

    await logic1.run();
    const result1 = await logic1.stackTop();

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
    })) as AllStandardOpsTest & Contract;

    await logic2.run();
    const result2 = await logic2.stackTop();

    assert(result2.isZero(), `returned wrong value from every, got ${result2}`);
  });

  it("should perform ternary 'eager if' operation on 3 values on the stack", async () => {
    this.timeout(0);

    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");

    const constants = [0, 1, 2, 3];

    const v0 = op(Opcode.CONSTANT, 0);
    const v1 = op(Opcode.CONSTANT, 1);
    const v2 = op(Opcode.CONSTANT, 2);
    const v3 = op(Opcode.CONSTANT, 3);

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
    })) as AllStandardOpsTest & Contract;

    await logic0.run();
    const result0 = await logic0.stackTop();

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
    })) as AllStandardOpsTest & Contract;

    await logic1.run();
    const result1 = await logic1.stackTop();

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
    })) as AllStandardOpsTest & Contract;

    await logic2.run();
    const result2 = await logic2.stackTop();

    assert(result2.eq(3), `returned wrong value from eager if, got ${result2}`);
  });

  it("should check that value is greater than another value", async () => {
    this.timeout(0);

    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");

    const constants = [1, 2];

    // prettier-ignore
    const source0 = concat([
      op(Opcode.CONSTANT, 1), // 2
      op(Opcode.CONSTANT, 0), // 1
      op(Opcode.GREATER_THAN),
    ]);

    const logic0 = (await logicFactory.deploy({
      sources: [source0],
      constants,
    })) as AllStandardOpsTest & Contract;

    await logic0.run();
    const result0 = await logic0.stackTop(); // expect 1

    assert(isTruthy(result0), "wrongly says 2 is not gt 1");

    // prettier-ignore
    const source1 = concat([
      op(Opcode.CONSTANT, 0), // 1
      op(Opcode.CONSTANT, 1), // 2
      op(Opcode.GREATER_THAN),
    ]);

    const logic1 = (await logicFactory.deploy({
      sources: [source1],
      constants,
    })) as AllStandardOpsTest & Contract;

    await logic1.run();
    const result1 = await logic1.stackTop(); // expect 0

    assert(!isTruthy(result1), "wrongly says 1 is gt 2");
  });

  it("should check that value is less than another value", async () => {
    this.timeout(0);

    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");

    const constants = [1, 2];

    // prettier-ignore
    const source0 = concat([
      op(Opcode.CONSTANT, 1), // 2
      op(Opcode.CONSTANT, 0), // 1
      op(Opcode.LESS_THAN),
    ]);

    const logic0 = (await logicFactory.deploy({
      sources: [source0],
      constants,
    })) as AllStandardOpsTest & Contract;

    await logic0.run();
    const result0 = await logic0.stackTop(); // expect 0

    assert(!isTruthy(result0), "wrongly says 2 is lt 1");

    // prettier-ignore
    const source1 = concat([
      op(Opcode.CONSTANT, 0), // 1
      op(Opcode.CONSTANT, 1), // 2
      op(Opcode.LESS_THAN),
    ]);

    const logic1 = (await logicFactory.deploy({
      sources: [source1],
      constants,
    })) as AllStandardOpsTest & Contract;

    await logic1.run();
    const result1 = await logic1.stackTop(); // expect 1

    assert(isTruthy(result1), "wrongly says 1 is not lt 2");
  });

  it("should check that values are equal to each other", async () => {
    this.timeout(0);

    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");

    const constants = [1, 2];

    // prettier-ignore
    const source0 = concat([
      op(Opcode.CONSTANT, 1), // 2
      op(Opcode.CONSTANT, 1), // 2
      op(Opcode.EQUAL_TO),
    ]);

    const logic0 = (await logicFactory.deploy({
      sources: [source0],
      constants,
    })) as AllStandardOpsTest & Contract;

    await logic0.run();
    const result0 = await logic0.stackTop(); // expect 1

    assert(isTruthy(result0), "wrongly says 2 is not equal to 2");

    // prettier-ignore
    const source1 = concat([
      op(Opcode.CONSTANT, 0), // 1
      op(Opcode.CONSTANT, 1), // 2
      op(Opcode.EQUAL_TO),
    ]);

    const logic1 = (await logicFactory.deploy({
      sources: [source1],
      constants,
    })) as AllStandardOpsTest & Contract;

    await logic1.run();
    const result1 = await logic1.stackTop(); // expect 0

    assert(!isTruthy(result1), "wrongly says 1 is equal to 2");
  });

  it.only("should check that a value is zero", async () => {
    this.timeout(0);
    const metaFactory = await ethers.getContractFactory("AllStandardOpsMeta");
    const meta = await metaFactory.deploy();
    await meta.deployed();

    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
    const logic0 = (await logicFactory.deploy()) as AllStandardOpsTest &
      Contract;

    const constants = [0, 1];

    // prettier-ignore
    const source0 = concat([
      op(Opcode.CONSTANT, 0),
      // op(Opcode.CONSTANT, 0),
      op(Opcode.ISZERO, 1),
      // op(Opcode.ISZERO, 2),
      // op(Opcode.ISZERO, 3),
    ]);

    const stateConfig0 = {
      // sources: [source0, concat([op(Opcode.CONSTANT, 1)])],
      sources: [source0],
      constants,
    };

    await meta.ptrSource(logic0.address, source0);

    const stateBytes0 = await meta.newStateBytes(
      logic0.address,
      stateConfig0,
      0
    );

    console.log(stateBytes0);

    await logic0.initialize(stateBytes0);

    await logic0.runBytes(stateBytes0);
    await logic0.clear();
    await logic0.run();
    const result0 = await logic0.stackTop(); // expect 1

    assert(isTruthy(result0), "wrongly says 0 is not zero");

    // // prettier-ignore
    // const source1 = concat([
    //   op(Opcode.CONSTANT, 1),
    //   op(Opcode.ISZERO),
    //   op(Opcode.ISZERO),
    //   op(Opcode.ISZERO),
    // ]);

    // const logic1 = await logicFactory.deploy() as AllStandardOpsTest & Contract;

    // const stateConfig1 = {
    //   sources: [source1],
    //   constants,
    // }
    // const stateBytes1 = await meta.newStateBytes(logic1.address, stateConfig1, 0)
    // await logic1.initialize(stateBytes1)

    // await logic1.run();
    // const result1 = await logic1.stackTop(); // expect 0

    // assert(!isTruthy(result1), "wrongly says 1 is zero");
  });
});
