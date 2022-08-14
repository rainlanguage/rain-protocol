import { assert, expect } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { StandardIntegrity } from "../../../../typechain/StandardIntegrity";
import type { AllStandardOpsTest } from "../../../../typechain/AllStandardOpsTest";
import { ReadWriteTier } from "../../../../typechain/ReadWriteTier";
import { TierReportTest } from "../../../../typechain/TierReportTest";
import {
  AllStandardOps,
  op,
  memoryOperand,
  MemoryType,
  callOperand,
  getBlockTimestamp,
  Tier,
  basicDeploy,
  timewarp,
} from "../../../../utils";

const Opcode = AllStandardOps;

describe("CALL Opcode test", async function () {
  let stateBuilder: StandardIntegrity;
  let logic: AllStandardOpsTest;

  before(async () => {
    const stateBuilderFactory = await ethers.getContractFactory(
      "StandardIntegrity"
    );
    stateBuilder =
      (await stateBuilderFactory.deploy()) as StandardIntegrity;
    await stateBuilder.deployed();

    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
    logic = (await logicFactory.deploy(
      stateBuilder.address
    )) as AllStandardOpsTest;
  });

  it("should change the eval's scope using CALL opcode", async () => {
    const constants = [0, 1];

    // CALL opcode which will take 2 inputs, pass it to source at index 1, and return 1 output
    // input = 3 bits [ 1-7 ]
    // output = 2 bits [ 1-3]
    // sourceIndex = 3 bits [ 1-7 ]

    const callADD = op(Opcode.CALL, callOperand(2, 1, 1));

    // Source to add 2 numbers, input will be provided from another source
    const sourceADD = concat([op(Opcode.ADD, 2)]);

    // Source for calculating fibonacci sequence uptill 5
    // prettier-ignore
    const sourceMAIN = concat([
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
          op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)),
          op(Opcode.STATE, memoryOperand(MemoryType.Stack, 1)),
        callADD,
          op(Opcode.STATE, memoryOperand(MemoryType.Stack, 1)),
          op(Opcode.STATE, memoryOperand(MemoryType.Stack, 2)),
        callADD,
          op(Opcode.STATE, memoryOperand(MemoryType.Stack, 2)),
          op(Opcode.STATE, memoryOperand(MemoryType.Stack, 3)),
        callADD,
          op(Opcode.STATE, memoryOperand(MemoryType.Stack, 3)),
          op(Opcode.STATE, memoryOperand(MemoryType.Stack, 4)),
        callADD
    ]);

    await logic.initialize({
      sources: [sourceMAIN, sourceADD],
      constants,
    });

    await logic.run();
    const result0 = await logic.stackTop();
    const expectedResult0 = ethers.BigNumber.from("5");
    assert(
      result0.eq(expectedResult0),
      `Invalid output, expected ${expectedResult0}, actual ${result0}`
    );
  });

  it("should process the minimum number of input", async () => {
    const constants = [10, 2, 20];
    const minInput = 0;

    // CALL opcode which will take 0 input, pass it to source at index 1, and return 1 output
    const call0 = op(Opcode.CALL, callOperand(minInput, 1, 1));

    // Source to multiply 2 numbers, input will be provided from another source
    const source1 = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // 2
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)), // 20
      op(Opcode.MUL, 2), // 40
    ]);

    // prettier-ignore
    const sourceMAIN = concat([
        call0,
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)), // 10
        op(Opcode.ADD, 2) // 50
    ]);

    await logic.initialize({
      sources: [sourceMAIN, source1],
      constants,
    });

    await logic.run();
    const result0 = await logic.stackTop();
    const expectedResult0 = ethers.BigNumber.from("50");
    assert(
      result0.eq(expectedResult0),
      `Invalid output, expected ${expectedResult0}, actual ${result0}`
    );
  });

  it("should process the maximum number of inputs and fail beyond that", async () => {
    const constants = [2];
    const maxInputs = 7;

    // CALL opcode which will take 7 inputs, pass it to source at index 1, and return 1 output
    const call0 = op(Opcode.CALL, callOperand(maxInputs, 1, 1));
    const source1 = concat([op(Opcode.MUL, maxInputs)]);

    // prettier-ignore
    const sourceMAIN0 = concat([
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        call0,
    ]);

    await logic.initialize({
      sources: [sourceMAIN0, source1],
      constants,
    });

    await logic.run();
    const result0 = await logic.stackTop();
    const expectedResult0 = ethers.BigNumber.from("128");
    assert(
      result0.eq(expectedResult0),
      `Invalid output, expected ${expectedResult0}, actual ${result0}`
    );
  });

  it("should process the minimum number of output", async () => {
    const constants = [2];
    const minOutput = 1;

    // CALL opcode which will take 2 inputs, pass it to source at index 1, and return 1 output
    const call0 = op(Opcode.CALL, callOperand(2, minOutput, 1));
    const source1 = concat([op(Opcode.MUL, 2)]);

    // prettier-ignore
    const sourceMAIN0 = concat([
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        call0,
    ]);

    await logic.initialize({
      sources: [sourceMAIN0, source1],
      constants,
    });

    await logic.run();
    const result0 = await logic.stackTop();
    const expectedResult0 = ethers.BigNumber.from("4");
    assert(
      result0.eq(expectedResult0),
      `Invalid output, expected ${expectedResult0}, actual ${result0}`
    );
  
  });

  it("should process the maximum number of output and fail beyond that", async () => {
    const constants = [2, 10, 20];
    const maxOutput = 3;

    // CALL opcode which will take 2 inputs, pass it to source at index 1, and return 3 outputs
    const call0 = op(Opcode.CALL, callOperand(2, maxOutput, 1));
    const source1 = concat([
      op(Opcode.MUL, 2),
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)),
    ]);

    // prettier-ignore
    const sourceMAIN0 = concat([
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        call0, // should end up adding 3 elements to the stack
    ]);

    await logic.initialize({
      sources: [sourceMAIN0, source1],
      constants,
    });

    await logic.run();
    const result0 = await logic.stack();

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
    const callADD = op(Opcode.CALL, callOperand(2, 1, 1));
    // prettier-ignore
    const sourceADD = concat([
      op(Opcode.ADD, 2)
    ]);

    const callSUB = op(Opcode.CALL, callOperand(1, 1, 2));
    // prettier-ignore
    const sourceSUB = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)), // 1
      op(Opcode.SUB, 2)
    ]);

    const callMUL = op(Opcode.CALL, callOperand(1, 1, 3));
    // prettier-ignore
    const sourceMUL = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // 10
      op(Opcode.MUL, 2)
    ]);

    const callDIV = op(Opcode.CALL, callOperand(1, 1, 4));
    // prettier-ignore
    const sourceDIV = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)), // 2
      op(Opcode.DIV, 2)
    ]);

    const callEXP = op(Opcode.CALL, callOperand(1, 1, 5));
    // prettier-ignore
    const sourceEXP = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)), // 2
      op(Opcode.EXP, 2)
    ]);

    const callADD10 = op(Opcode.CALL, callOperand(1, 1, 6));
    // prettier-ignore
    const sourceADD10 = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // 10
      op(Opcode.ADD, 2)
    ]);

    const callADD1 = op(Opcode.CALL, callOperand(1, 1, 7));
    // prettier-ignore
    const sourceADD1 = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)), // 1
      op(Opcode.ADD, 2)
    ]);

    // prettier-ignore
    const sourceMAIN = concat([
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)), // 2
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)), // 2
        callADD, // 4
        callSUB, // 4 - 1 = 3
        callMUL, // 3 * 10 = 30
        callDIV, // 30 / 2 = 15
        callEXP, // 15 ** 2 = 225
        callADD10, // 225 + 10 = 235
        callADD1, // 235 + 1 = 236
    ]);

    await logic.initialize({
      sources: [
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
    });

    await logic.run();
    const result0 = await logic.stackTop();
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
    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const readWriteTier = (await tierFactory.deploy()) as ReadWriteTier;
    await readWriteTier.deployed();
    const tierReport = (await basicDeploy(
      "TierReportTest",
      {}
    )) as TierReportTest;

    // Setting Alice's Tier
    await readWriteTier.connect(alice).setTier(alice.address, Tier.TWO, []);
    await timewarp(10);

    // Setting Bob's tier
    await readWriteTier.connect(bob).setTier(bob.address, Tier.FOUR, []);
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

    const callGetDiscount = op(Opcode.CALL, callOperand(1, 1, 1));

    // prettier-ignore
    const sourceGetDiscount = concat([
          // IF TIER == 1
            op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)), // Adding extra copy of Tier being passed to function
            op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
          op(Opcode.EQUAL_TO), 
          // THEN DISCOUNT = 10
            op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
            op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
          op(Opcode.MUL, 2), 
            // ELSE IF TIER == 2
              op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)), // Using the extra copy to compare
              op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)),
            op(Opcode.EQUAL_TO), 
              // THEN DISCOUNT = 20
              op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
              op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)),
            op(Opcode.MUL, 2), 
                // ELSE IF TIER == 3
                op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)), // Using the extra copy to compare
                op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3)),
              op(Opcode.EQUAL_TO), 
                // THEN DISCOUNT = 30
                op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
                op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3)),
              op(Opcode.MUL, 2), 
                  // ELSE IF TIER == 4
                  op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)), // Using the extra copy to compare
                  op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4)),
                op(Opcode.EQUAL_TO), 
                  // THEN DISCOUNT = 40
                  op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
                  op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4)),
                op(Opcode.MUL, 2), 
                    // ELSE IF TIER == 5
                    op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)), // Using the extra copy to compare
                    op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5)),
                  op(Opcode.EQUAL_TO), 
                    // THEN DISCOUNT = 50
                    op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
                    op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5)),
                  op(Opcode.MUL, 2), 
                      // ELSE IF TIER == 6
                      op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)), // Using the extra copy to compare
                      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6)),
                    op(Opcode.EQUAL_TO), 
                      // THEN DISCOUNT = 60
                      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
                      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6)),
                    op(Opcode.MUL, 2), 
                        // ELSE IF TIER == 7
                        op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)), // Using the extra copy to compare
                        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7)),
                      op(Opcode.EQUAL_TO), 
                        // THEN DISCOUNT = 70
                        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
                        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7)),
                      op(Opcode.MUL, 2), 
                        // ELSE 
                      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 8)), 
                    op(Opcode.EAGER_IF), // TIER == 7
                  op(Opcode.EAGER_IF), // TIER == 6
                op(Opcode.EAGER_IF), // TIER == 5
              op(Opcode.EAGER_IF), // TIER == 4
            op(Opcode.EAGER_IF), // TIER == 3
          op(Opcode.EAGER_IF), // TIER == 2
        op(Opcode.EAGER_IF), // TIER == 1
    ]);

    // prettier-ignore
    const sourceGetDiscountedPrice = concat([
        op(Opcode.CONTEXT, 1), // PRICE
          op(Opcode.CONTEXT, 0), // TIER 
        callGetDiscount, // This function takes TIER as an input and returns the discount that will be applied on the price
      op(Opcode.SUB, 2) // PRICE - DISCOUNT
    ]);

    await logic.initialize({
      sources: [sourceGetDiscountedPrice, sourceGetDiscount],
      constants,
    });

    // Calculating price for Alice
    const reportAlice = await readWriteTier.report(alice.address, []);
    const tierBlockReportAlice = await tierReport.tierAtTimeFromReport(
      reportAlice,
      initialTimestamp + 5
    );
    await logic.runContext([tierBlockReportAlice, assetPrice]);
    const resultAlice = await logic.stackTop();
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

    await logic.runContext([tierBlockReportBob, assetPrice]);
    const resultBob = await logic.stackTop();
    const expectedPriceBob = ethers.BigNumber.from("60"); // 100 - 40
    assert(
      resultBob.eq(expectedPriceBob),
      `Invalid price returned for Bob. Expected : ${expectedPriceBob} Actual ${resultBob}`
    );
  });
});
