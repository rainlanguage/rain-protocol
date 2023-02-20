import { assert, expect } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { TierReportTest } from "../../../../typechain";
import {
  AllStandardOps,
  assertError,
  basicDeploy,
  callOperand,
  getBlockTimestamp,
  memoryOperand,
  MemoryType,
  op,
  readWriteTierDeploy,
  standardEvaluableConfig,
  Tier,
  timewarp,
} from "../../../../utils";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { iinterpreterV1ConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";

const Opcode = AllStandardOps;

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
    const constants = [2, 10, 1];

    // CALL opcode which will take 0 input, pass it to source at index 1, and return 1 output
    const callADD = op(Opcode.call, callOperand(2, 1, 1));
    // prettier-ignore
    const sourceADD = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 0)),
      op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 1)),
      op(Opcode.add, 2)
    ]);

    const callSUB = op(Opcode.call, callOperand(1, 1, 2));
    // prettier-ignore
    const sourceSUB = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 0)),
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)), // 1
      op(Opcode.sub, 2)
    ]);

    const callMUL = op(Opcode.call, callOperand(1, 1, 3));
    // prettier-ignore
    const sourceMUL = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 0)),
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // 10
      op(Opcode.mul, 2)
    ]);

    const callDIV = op(Opcode.call, callOperand(1, 1, 4));
    // prettier-ignore
    const sourceDIV = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 0)),
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)), // 2
      op(Opcode.div, 2)
    ]);

    const callEXP = op(Opcode.call, callOperand(1, 1, 5));
    // prettier-ignore
    const sourceEXP = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 0)),
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)), // 2
      op(Opcode.exp, 2)
    ]);

    const callADD10 = op(Opcode.call, callOperand(1, 1, 6));
    // prettier-ignore
    const sourceADD10 = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 0)),
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // 10
      op(Opcode.add, 2)
    ]);

    const callADD1 = op(Opcode.call, callOperand(1, 1, 7));
    // prettier-ignore
    const sourceADD1 = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 0)),
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)), // 1
      op(Opcode.add, 2)
    ]);

    // prettier-ignore
    const sourceMAIN = concat([
          op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)), // 2
          op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)), // 2
        callADD, // 4
        callSUB, // 4 - 1 = 3
        callMUL, // 3 * 10 = 30
        callDIV, // 30 / 2 = 15
        callEXP, // 15 ** 2 = 225
        callADD10, // 225 + 10 = 235
        callADD1, // 235 + 1 = 236
    ]);

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(
        [
          sourceMAIN,
          sourceADD,
          sourceSUB,
          sourceMUL,
          sourceDIV,
          sourceEXP,
          sourceADD10,
          sourceADD1,
        ],
        constants,

        1
      );

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

  it("should execute a function which will calculate the discount based on user's TIER", async () => {
    const initialTimestamp = await getBlockTimestamp();
    const [, alice, bob] = await ethers.getSigners();

    // Tier Factory
    const readWriteTier = await readWriteTierDeploy();

    const tierReport = (await basicDeploy(
      "TierReportTest",
      {}
    )) as TierReportTest;

    // Setting Alice's Tier
    await readWriteTier.connect(alice).setTier(alice.address, Tier.TWO);
    await timewarp(10);

    // Setting Bob's tier
    await readWriteTier.connect(bob).setTier(bob.address, Tier.FOUR);
    timewarp(10);

    // Setting Asset price
    const assetPrice = ethers.BigNumber.from("100");

    const constants = [
      10, // Discount Multiplier
      Tier.ONE,
      Tier.TWO,
      Tier.THREE,
      Tier.FOUR,
      Tier.FIVE,
      Tier.SIX,
      Tier.SEVEN,
      Tier.EIGHT,
      0, // No Discount
    ];

    const callGetDiscount = op(Opcode.call, callOperand(1, 1, 1));

    // prettier-ignore
    const sourceGetDiscount = concat([
          // IF TIER == 1
            op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 0)), // Adding extra copy of Tier being passed to function
            op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)),
          op(Opcode.equal_to),
          // THEN DISCOUNT = 10
            op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
            op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)),
          op(Opcode.mul, 2),
            // ELSE IF TIER == 2
              op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 0)), // Using the extra copy to compare
              op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)),
            op(Opcode.equal_to),
              // THEN DISCOUNT = 20
              op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
              op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)),
            op(Opcode.mul, 2),
                // ELSE IF TIER == 3
                op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 0)), // Using the extra copy to compare
                op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3)),
              op(Opcode.equal_to),
                // THEN DISCOUNT = 30
                op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
                op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3)),
              op(Opcode.mul, 2),
                  // ELSE IF TIER == 4
                  op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 0)), // Using the extra copy to compare
                  op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 4)),
                op(Opcode.equal_to),
                  // THEN DISCOUNT = 40
                  op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
                  op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 4)),
                op(Opcode.mul, 2),
                    // ELSE IF TIER == 5
                    op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 0)), // Using the extra copy to compare
                    op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 5)),
                  op(Opcode.equal_to),
                    // THEN DISCOUNT = 50
                    op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
                    op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 5)),
                  op(Opcode.mul, 2),
                      // ELSE IF TIER == 6
                      op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 0)), // Using the extra copy to compare
                      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 6)),
                    op(Opcode.equal_to),
                      // THEN DISCOUNT = 60
                      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
                      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 6)),
                    op(Opcode.mul, 2),
                        // ELSE IF TIER == 7
                        op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 0)), // Using the extra copy to compare
                        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 7)),
                      op(Opcode.equal_to),
                        // THEN DISCOUNT = 70
                        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
                        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 7)),
                      op(Opcode.mul, 2),
                        // ELSE
                      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 8)),
                    op(Opcode.eager_if), // TIER == 7
                  op(Opcode.eager_if), // TIER == 6
                op(Opcode.eager_if), // TIER == 5
              op(Opcode.eager_if), // TIER == 4
            op(Opcode.eager_if), // TIER == 3
          op(Opcode.eager_if), // TIER == 2
        op(Opcode.eager_if), // TIER == 1
    ]);

    // prettier-ignore
    const sourceGetDiscountedPrice = concat([
        op(Opcode.context, 0x0001), // PRICE
          op(Opcode.context, 0x0000), // TIER
        callGetDiscount, // This function takes TIER as an input and returns the discount that will be applied on the price
      op(Opcode.sub, 2) // PRICE - DISCOUNT
    ]);

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(
        [sourceGetDiscountedPrice, sourceGetDiscount],
        constants,

        1
      );

    // Calculating price for Alice
    const reportAlice = await readWriteTier.report(alice.address, []);
    const tierBlockReportAlice = await tierReport.tierAtTimeFromReport(
      reportAlice,
      initialTimestamp + 5
    );

    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      [[tierBlockReportAlice, assetPrice]]
    );
    const resultAlice = await consumerLogic.stackTop();

    const expectedPriceAlice = ethers.BigNumber.from("80"); // 100 - 20
    assert(
      resultAlice.eq(expectedPriceAlice),
      `Invalid price returned for Alice. Expected : ${expectedPriceAlice} Actual ${resultAlice}`
    );

    // Calculating price for Bob
    const reportBob = await readWriteTier.report(bob.address, []);
    const tierBlockReportBob = await tierReport.tierAtTimeFromReport(
      reportBob,
      initialTimestamp + 15
    );

    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      [[tierBlockReportBob, assetPrice]]
    );

    const resultBob = await consumerLogic.stackTop();
    const expectedPriceBob = ethers.BigNumber.from("60"); // 100 - 40
    assert(
      resultBob.eq(expectedPriceBob),
      `Invalid price returned for Bob. Expected : ${expectedPriceBob} Actual ${resultBob}`
    );
  });
});
