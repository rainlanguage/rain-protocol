import { assert, expect } from "chai";
import { ethers } from "hardhat";
import type { TierReportTest } from "../../../../typechain";
import {
  assertError,
  basicDeploy,
  getBlockTimestamp,
  MemoryType,
  readWriteTierDeploy,
  standardEvaluableConfig,
  Tier,
  timewarp,
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

    const { sources, constants } = standardEvaluableConfig(
      `
      /* main source 0 sourceGetDiscountedPrice */
      ctx-tier: context<0 0>(),
      ctx-price: context<1 0>(),
      _:  sub(
            ctx-price
            call<1 1>(
              ctx-tier
            )
          );

      /* source 1 sourceGetDiscount */
      /* This function takes TIER as an input and returns the discount that will be applied on the price */
      discount-mul: 10,
      discount-zero: 0,
      tier: read-memory<${MemoryType.Stack} 0>(),
      _:  eager-if(
            equal-to(tier ${Tier.ONE})
            mul(discount-mul tier)
            eager-if(
              equal-to(tier ${Tier.TWO})
              mul(discount-mul tier)
              eager-if(
                equal-to(tier ${Tier.THREE})
                mul(discount-mul tier)
                eager-if(
                  equal-to(tier ${Tier.FOUR})
                  mul(discount-mul tier)
                  eager-if(
                    equal-to(tier ${Tier.FIVE})
                    mul(discount-mul tier)
                    eager-if(
                      equal-to(tier ${Tier.SIX})
                      mul(discount-mul tier)
                      eager-if(
                        equal-to(tier ${Tier.SEVEN})
                        mul(discount-mul tier)
                        eager-if(
                          equal-to(tier ${Tier.EIGHT})
                          mul(discount-mul tier)
                          discount-zero
                        )
                      )
                    )
                  )
                )
              )
            )
          );
      `
    );

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(sources, constants, 1);

    // Calculating price for Alice
    const reportAlice = await readWriteTier.report(alice.address, []);
    const tierBlockReportAlice = await tierReport.tierAtTimeFromReport(
      reportAlice,
      initialTimestamp + 5
    );
    assert(tierBlockReportAlice.eq(2));

    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      [[tierBlockReportAlice, assetPrice]]
    );
    const resultAlice = await consumerLogic.stackTop();

    const expectedPriceAlice = ethers.BigNumber.from("80"); // 100 - 20
    assert(
      resultAlice.eq(expectedPriceAlice),
      `Invalid price returned for Alice.
      expected ${expectedPriceAlice}
      actual   ${resultAlice}`
    );

    // Calculating price for Bob
    const reportBob = await readWriteTier.report(bob.address, []);
    const tierBlockReportBob = await tierReport.tierAtTimeFromReport(
      reportBob,
      initialTimestamp + 15
    );
    assert(tierBlockReportAlice.eq(4));

    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      [[tierBlockReportBob, assetPrice]]
    );

    const resultBob = await consumerLogic.stackTop();
    const expectedPriceBob = ethers.BigNumber.from("60"); // 100 - 40
    assert(
      resultBob.eq(expectedPriceBob),
      `Invalid price returned for Bob.
      expected ${expectedPriceBob}
      actual   ${resultBob}`
    );
  });
});
