import { assert, expect } from "chai";
import { ethers } from "hardhat";
import {
  assertError,
  MemoryType,
  standardEvaluableConfig,
} from "../../../../utils";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { iinterpreterV1ConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";

describe("CALL Opcode test", async function () {
  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);
  });

  it("should execute a simple call (increment a number)", async () => {
    const { sources, constants } = standardEvaluableConfig(
      `
      /* main source */
      _:  call<1 1>(2);

      /* source 1 */
      _:  add(
            read-memory<${MemoryType.Stack} 0>()
            1
          );`
    );

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(sources, constants, 1);

    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      []
    );

    const result = await consumerLogic.stackTop();
    const expectedResult = 3;

    assert(result.eq(expectedResult));
  });

  it("should change the eval's scope using CALL opcode", async () => {
    const { sources, constants } = standardEvaluableConfig(
      `
      /* main source calculating fibonacci sequence up to 5 */
      _ _ _ _ _ _:
          0
          1
          call<1 1>(
            read-memory<${MemoryType.Stack} 0>()
            read-memory<${MemoryType.Stack} 1>()
          )
          call<1 1>(
            read-memory<${MemoryType.Stack} 1>()
            read-memory<${MemoryType.Stack} 2>()
          )
          call<1 1>(
            read-memory<${MemoryType.Stack} 2>()
            read-memory<${MemoryType.Stack} 3>()
          )
          call<1 1>(
            read-memory<${MemoryType.Stack} 3>()
            read-memory<${MemoryType.Stack} 4>()
          );

      /* source 1 */
      _:  add(
            read-memory<${MemoryType.Stack} 0>()
            read-memory<${MemoryType.Stack} 1>()
          )
        ;`
    );

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(sources, constants, 6);

    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      []
    );

    const result0 = await consumerLogic.stackTop();
    const expectedResult0 = ethers.BigNumber.from("5");
    assert(
      result0.eq(expectedResult0),
      `Invalid output, expected ${expectedResult0}, actual ${result0}`
    );
  });

  it("should process the minimum number of input", async () => {
    const { sources, constants } = standardEvaluableConfig(
      `
      /* main source */
      _:  add(
            call<1 1>()
            10
          );

      /* source 1 */
      _:  mul(2 20);`
    );

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(sources, constants, 1);

    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      []
    );
    const result0 = await consumerLogic.stackTop();
    const expectedResult0 = ethers.BigNumber.from("50");
    assert(
      result0.eq(expectedResult0),
      `Invalid output, expected ${expectedResult0}, actual ${result0}`
    );
  });

  it("should process the maximum number of inputs and fail beyond that", async () => {
    const { sources: sources0, constants: constants0 } =
      standardEvaluableConfig(
        `
      /* main source */
      _:  call<1 1>(2 2 2 2 2 2 2 2 2 2 2 2 2 2 2);

      /* source 1 */
      _:  mul(
            read-memory<${MemoryType.Stack} 0>()
            read-memory<${MemoryType.Stack} 1>()
            read-memory<${MemoryType.Stack} 2>()
            read-memory<${MemoryType.Stack} 3>()
            read-memory<${MemoryType.Stack} 4>()
            read-memory<${MemoryType.Stack} 5>()
            read-memory<${MemoryType.Stack} 6>()
            read-memory<${MemoryType.Stack} 7>()
            read-memory<${MemoryType.Stack} 8>()
            read-memory<${MemoryType.Stack} 9>()
            read-memory<${MemoryType.Stack} 10>()
            read-memory<${MemoryType.Stack} 11>()
            read-memory<${MemoryType.Stack} 12>()
            read-memory<${MemoryType.Stack} 13>()
            read-memory<${MemoryType.Stack} 14>()
          );`
      );

    const {
      consumerLogic: consumerLogic0,
      interpreter: interpreter0,
      dispatch: dispatch0,
    } = await iinterpreterV1ConsumerDeploy(sources0, constants0, 1);

    await consumerLogic0["eval(address,uint256,uint256[][])"](
      interpreter0.address,
      dispatch0,
      []
    );
    const result0 = await consumerLogic0.stackTop();
    const expectedResult0 = ethers.BigNumber.from(2 ** 15);
    assert(
      result0.eq(expectedResult0),
      `Invalid output, expected ${expectedResult0}, actual ${result0}`
    );

    assertError(
      () =>
        standardEvaluableConfig(
          `
      /* main source */
      _:  call<1 1>(2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2);

      /* source 1 */
      _:  mul(
            read-memory<${MemoryType.Stack} 0>()
            read-memory<${MemoryType.Stack} 1>()
            read-memory<${MemoryType.Stack} 2>()
            read-memory<${MemoryType.Stack} 3>()
            read-memory<${MemoryType.Stack} 4>()
            read-memory<${MemoryType.Stack} 5>()
            read-memory<${MemoryType.Stack} 6>()
            read-memory<${MemoryType.Stack} 7>()
            read-memory<${MemoryType.Stack} 8>()
            read-memory<${MemoryType.Stack} 9>()
            read-memory<${MemoryType.Stack} 10>()
            read-memory<${MemoryType.Stack} 11>()
            read-memory<${MemoryType.Stack} 12>()
            read-memory<${MemoryType.Stack} 13>()
            read-memory<${MemoryType.Stack} 14>()
            read-memory<${MemoryType.Stack} 15>()
          );`
        ),
      "out-of-range operand args",
      "did not error when call inputs arg out of range (4 bits)"
    );
  });

  it("should process the minimum number of output", async () => {
    const { sources, constants } = standardEvaluableConfig(
      `
      /* main source */
      _:  call<1 1>(2 2);

      /* source 1 */
      _:  mul(
            read-memory<${MemoryType.Stack} 0>()
            read-memory<${MemoryType.Stack} 1>()
          );`
    );

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(sources, constants, 1);

    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      []
    );
    const result0 = await consumerLogic.stackTop();

    const expectedResult0 = ethers.BigNumber.from("4");
    assert(
      result0.eq(expectedResult0),
      `Invalid output, expected ${expectedResult0}, actual ${result0}`
    );
  });

  it("should process the maximum number of output and fail beyond that", async () => {
    const { sources, constants } = standardEvaluableConfig(
      `
      /* main source */
      _ _ _:  call<3 1>(2 2);

      /* source 1 */
      _ _ _:  mul(
                read-memory<${MemoryType.Stack} 0>()
                read-memory<${MemoryType.Stack} 1>()
              )
              10
              20
          ;`
    );

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(sources, constants, 3);

    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      []
    );
    const result0 = await consumerLogic.stack();

    const expectedResult0 = [
      ethers.BigNumber.from("4"),
      ethers.BigNumber.from("10"),
      ethers.BigNumber.from("20"),
    ];
    expect(result0).deep.equal(
      expectedResult0,
      `Invalid output, expected ${expectedResult0}, actual ${result0}`
    );
  });

  it("should process the maximum number of sources", async () => {
    /*
      call<1 1>  4
      call<1 2>  4 - 1 = 3
      call<1 3>  3 * 10 = 30
      call<1 4>  30 / 2 = 15
      call<1 5>  15 ** 2 = 225
      call<1 6>  225 + 10 = 235
      call<1 7>  235 + 1 = 236
    */

    const { sources, constants } = standardEvaluableConfig(
      `
      /* main source */
      _:  call<1 7>(
            call<1 6>(
              call<1 5>(
                call<1 4>(
                  call<1 3>(
                    call<1 2>(
                      call<1 1>(2 2)
                    )
                  )
                )
              )
            )
          );

      /* source 1 */
      _:  add(
            read-memory<${MemoryType.Stack} 0>()
            read-memory<${MemoryType.Stack} 1>()
          );

      /* source 2 */
      _:  sub(
            read-memory<${MemoryType.Stack} 0>()
            1
          );

      /* source 3 */
      _:  mul(
            read-memory<${MemoryType.Stack} 0>()
            10
          );

      /* source 4 */
      _:  div(
            read-memory<${MemoryType.Stack} 0>()
            2
          );

      /* source 5 */
      _:  exp(
            read-memory<${MemoryType.Stack} 0>()
            2
          );

      /* source 6 */
      _:  add(
            read-memory<${MemoryType.Stack} 0>()
            10
          );

      /* source 7 */
      _:  add(
            read-memory<${MemoryType.Stack} 0>()
            1
          );
      `
    );

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(sources, constants, 1);

    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      []
    );
    const result0 = await consumerLogic.stackTop();

    const expectedResult0 = ethers.BigNumber.from("236");
    assert(
      result0.eq(expectedResult0),
      `Invalid output, expected ${expectedResult0}, actual ${result0}`
    );
  });

  it("should forward inputs to a call while also supporting other aliases", async () => {
    const { sources, constants } = standardEvaluableConfig(
      `
      /* main source 0 */
      _ _:  call<2 1>(10);

      /* source 1 */
      ten: ,
      twenty: 20,
      _ _:  ten twenty;
      `
    );

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(sources, constants, 2);

    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      []
    );

    const expectedResults = [10, 20];
    const results = await consumerLogic.stack();

    expectedResults.forEach((expected, i_) => {
      assert(
        results[i_].eq(expected),
        `wrong value at stack position ${i_}
        expected  ${expected}
        actual    ${results[i_]}`
      );
    });
  });

  it("should preserve a stack value in a call", async () => {
    const { sources, constants } = standardEvaluableConfig(
      `
      /* main source 0 */
      value: 10,
      _ _ _:    call<3 1>(value);

      /* source 1 */
      stack-value: read-memory<${MemoryType.Stack} 0>(),
      _ _ _:
            ensure(stack-value)

            stack-value

            eager-if(
              0
              20
              stack-value
            )

            eager-if(
              0
              30
              eager-if(
                0
                40
                stack-value
              )
            );
      `
    );

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(sources, constants, 3);

    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      []
    );

    const results = await consumerLogic.stack();

    for (let i_ = 0; i_ < 3; i_++) {
      assert(results[i_].eq(10));
    }
  });
});
