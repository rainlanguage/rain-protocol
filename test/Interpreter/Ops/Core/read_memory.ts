import { strict as assert } from "assert";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import {
  AllStandardOps,
  assertError,
  getBlockTimestamp,
  memoryOperand,
  MemoryType,
  op,
  standardEvaluableConfig,
} from "../../../../utils";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { rainlang } from "../../../../utils/extensions/rainlang";

const Opcode = AllStandardOps;

describe("READ_MEMORY Opcode test", async function () {
  let rainInterpreter: Rainterpreter;
  let logic: IInterpreterV1Consumer;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    rainInterpreter = await rainterpreterDeploy();

    const consumerFactory = await ethers.getContractFactory(
      "IInterpreterV1Consumer"
    );
    logic = (await consumerFactory.deploy()) as IInterpreterV1Consumer;
    await logic.deployed();
  });

  it("should read a value from CONSTANT and place it on the STACK", async () => {
    const constants = [1337];
    const { sources } = await standardEvaluableConfig(
      rainlang`_: read-memory<0 ${MemoryType.Constant}>();`
    );

    const expression0 = await expressionConsumerDeploy(
      sources,
      constants,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result0 = await logic.stackTop();
    const expectedResult0 = ethers.BigNumber.from(constants[0]);
    assert.deepEqual(
      result0,
      expectedResult0,
      `Invalid output, expected ${expectedResult0}, actual ${result0}`
    );
  });

  it("should read a value from STACK and place it on the STACK", async () => {
    const constants = [1337];
    const { sources } = await standardEvaluableConfig(
      rainlang`_ _ _ _:
        block-timestamp()
        read-memory<0 ${MemoryType.Constant}>()
        read-memory<1 ${MemoryType.Stack}>()
        read-memory<0 ${MemoryType.Stack}>();`
    );

    const expression0 = await expressionConsumerDeploy(
      sources,
      constants,
      rainInterpreter,
      4
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const expectedTimeStamp = await getBlockTimestamp();

    const result0 = await logic.stack();
    const expectedResult0 = [
      ethers.BigNumber.from(expectedTimeStamp),
      ethers.BigNumber.from(1337),
      ethers.BigNumber.from(1337),
      ethers.BigNumber.from(expectedTimeStamp),
    ];

    assert.deepEqual(
      result0,
      expectedResult0,
      `Invalid output, expected ${expectedResult0}, actual ${result0}`
    );
  });

  it("should fail when reading an OOB STACK value", async () => {
    const constants = [1337];
    const { sources } = await standardEvaluableConfig(
      rainlang`_ _ _:
        block-timestamp()
        read-memory<0 ${MemoryType.Stack}>()
        read-memory<2 ${MemoryType.Stack}>();` // Reading an OOB value
    );

    await assertError(
      async () =>
        await expressionConsumerDeploy(sources, constants, rainInterpreter, 3),
      "OutOfBoundsStackRead(2, 2)",
      "Integrity check failed while reading an OOB stack value"
    );
  });

  it("should fail when reading an OOB CONSTANT value", async () => {
    const constants = [1337];
    const { sources } = await standardEvaluableConfig(
      rainlang`_ _:
        read-memory<0 ${MemoryType.Constant}>()
        read-memory<1 ${MemoryType.Constant}>();` // Reading an OOB value
    );

    await assertError(
      async () =>
        await expressionConsumerDeploy(sources, constants, rainInterpreter, 2),
      "OutOfBoundsConstantsRead(1, 1)",
      "Integrity check failed while reading an OOB constant value"
    );
  });

  it("should error when STACK operand references a STACK element that hasn't yet been evaluated", async () => {
    const constants = [10, 20, 30];
    const { sources } = await standardEvaluableConfig(
      rainlang`_ _ _ _:
        read-memory<0 ${MemoryType.Constant}>()
        read-memory<1 ${MemoryType.Constant}>()
        read-memory<3 ${MemoryType.Stack}>()
        read-memory<2 ${MemoryType.Constant}>();`
    );

    await assertError(
      async () =>
        await expressionConsumerDeploy(sources, constants, rainInterpreter, 4),
      "OutOfBoundsStackRead(2, 3)", // at least an error
      "did not error when STACK operand references a stack element that hasn't yet been evaluated"
    );
  });

  it("should error when STACK operand references itself", async () => {
    const constants = [10, 20, 30];
    const { sources } = await standardEvaluableConfig(
      rainlang`_ _ _ _:
        read-memory<0 ${MemoryType.Constant}>()
        read-memory<1 ${MemoryType.Constant}>()
        read-memory<2 ${MemoryType.Constant}>()
        read-memory<3 ${MemoryType.Stack}>();`
    );

    await assertError(
      async () =>
        await expressionConsumerDeploy(sources, constants, rainInterpreter, 4),
      "OutOfBoundsStackRead(3, 3)", // at least an error
      "did not error when STACK operand references itself"
    );
  });

  it("should evaluate to correct stack element when STACK is called within a nested evaluation", async () => {
    const constants = [8, 16, 32, 64];

    // STACK should have access to all evaluated stack values

    const { sources } = await standardEvaluableConfig(
      rainlang`_ _ _:
        read-memory<0 ${MemoryType.Constant}>()
        read-memory<1 ${MemoryType.Constant}>()
        add(
          read-memory<2 ${MemoryType.Constant}>()
          read-memory<3 ${MemoryType.Constant}>()
          read-memory<0 ${MemoryType.Stack}>()
        );`
    );

    const expression0 = await expressionConsumerDeploy(
      sources,
      constants,
      rainInterpreter,
      3
    );
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );

    const result = await logic.stackTop();
    const expected = constants[2] + constants[3] + constants[0];
    assert(
      result.eq(expected),
      `STACK operand evaluated to wrong stack element when STACK is called within a nested evaluation
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should return correct stack element when there are nested evaluations (e.g. returns the addition of several stack elements, rather than a summand)", async () => {
    const constants = [10, 20, 30];

    const { sources } = await standardEvaluableConfig(
      rainlang`_ _:
        add(
          read-memory<0 ${MemoryType.Constant}>()
          read-memory<1 ${MemoryType.Constant}>()
          read-memory<2 ${MemoryType.Constant}>()
        )
        read-memory<0 ${MemoryType.Stack}>();`
    );

    const expression0 = await expressionConsumerDeploy(
      sources,
      constants,
      rainInterpreter,
      2
    );
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );

    const result = await logic.stackTop();

    assert(
      result.eq(60),
      "STACK operand returned wrong stack element when there are nested evaluations (e.g. returns the addition of several stack elements, rather than a summand)"
    );
  });

  it("should return correct stack element when specifying operand", async () => {
    const constants = [10, 20, 30];
    const { sources } = await standardEvaluableConfig(
      rainlang`_ _ _ _:
        read-memory<0 ${MemoryType.Constant}>()
        read-memory<1 ${MemoryType.Constant}>()
        read-memory<2 ${MemoryType.Constant}>()
        read-memory<1 ${MemoryType.Stack}>();`
    );

    const expression0 = await expressionConsumerDeploy(
      sources,
      constants,
      rainInterpreter,
      4
    );
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );

    const result = await logic.stackTop();

    assert(
      result.eq(constants[1]),
      "STACK operand returned wrong stack element"
    );
  });

  it("should error when trying to read an out-of-bounds constant", async () => {
    const constants = [1];
    const { sources } = await standardEvaluableConfig(
      rainlang`_: read-memory<1 ${MemoryType.Constant}>();`
    );

    await assertError(
      async () =>
        await expressionConsumerDeploy(sources, constants, rainInterpreter, 1),
      "OutOfBoundsConstantsRead(1, 1)",
      "did not error when trying to read an out-of-bounds constant"
    );
  });

  it("should prevent bad RainInterpreter script attempting to access stack index out of bounds (underflow)", async () => {
    const constants = [0, 1];
    const v0 = op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0));
    const v1 = op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1));

    // prettier-ignore
    const sources = [
      concat([
          v0,
          v1,
        op(Opcode.eager_if),
      ]),
    ];

    await assertError(
      async () =>
        await expressionConsumerDeploy(sources, constants, rainInterpreter, 1),
      "StackPopUnderflow",
      "did not prevent bad RainInterpreter script accessing stack index out of bounds"
    );
  });

  it("should prevent bad RainInterpreter script attempting to access stack index out of bounds (overflow)", async () => {
    const constants = [3, 2, 1];
    const v3 = op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0));
    const v2 = op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1));
    const v1 = op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2));

    // prettier-ignore
    const sources = [
      concat([
        // (1 2 3 +)
          v1,
          v2,
          v3,
        op(Opcode.add, 4),
      ]),
    ];

    await assertError(
      async () =>
        await expressionConsumerDeploy(sources, constants, rainInterpreter, 1),
      "StackPopUnderflow",
      "did not prevent bad RainInterpreter script accessing stack index out of bounds"
    );
  });
});
