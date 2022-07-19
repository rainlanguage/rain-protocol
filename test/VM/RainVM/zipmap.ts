import { assert } from "chai";
import { BigNumber } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { AllStandardOpsStateBuilder } from "../../../typechain/AllStandardOpsStateBuilder";
import {
  AllStandardOpsTest,
  VMStateStruct,
} from "../../../typechain/AllStandardOpsTest";
import { CombineTier } from "../../../typechain/CombineTier";
import { ALWAYS, combineTierDeploy, paddedUInt256, paddedUInt32, Tier, tierRange } from "../../../utils";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { bytify, op, selectLte, selectLteLogic, selectLteMode, zipmapSize } from "../../../utils/rainvm/vm";

const Opcode = AllStandardOps;

describe("RainVM zipmap", async function () {
  let stateBuilder: AllStandardOpsStateBuilder;
  let logic: AllStandardOpsTest;

  before(async () => {
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

  it("should handle a zipmap which loops 4 times", async () => {
    // The following 3 variables use zero-based counting.

    // Which index in `sources` array to use as our inner function to ZIPMAP.
    const sourceIndex = 1;

    // Number of times to 'break up' our uint256 constants into a concatenated array of 'sub-constants'. In this case, we subdivide a constant 4 times, so we are left with 8 uint32 'sub-constants' concatenated together.
    const loopSize = 3;

    // Number of constants to zip together. Here we are zipping 2 constants together. Hence, our inner function will accept 2 arguments at a time (arg0, arg1), which will be the sub-constants of the respective constants.
    const valSize = 1;

    // Size of each 'sub-constant' in bytes, which can be determined by how many times we broke up our uint256. In this case we have 32-bit unsigned integers.
    const valBytes = 32 / Math.pow(2, loopSize);

    // prettier-ignore
    const constants = [ // a.k.a. 'vals'
      concat([ // constant0 -> an array of sub-constants
        bytify(1, valBytes),
        bytify(2, valBytes),
        bytify(3, valBytes),
        bytify(4, valBytes),
        bytify(5, valBytes),
        bytify(6, valBytes),
        bytify(7, valBytes),
        bytify(8, valBytes),
      ]),
      concat([ // constant1 -> an array of sub-constants
        bytify(10, valBytes),
        bytify(20, valBytes),
        bytify(30, valBytes),
        bytify(40, valBytes),
        bytify(50, valBytes),
        bytify(60, valBytes),
        bytify(70, valBytes),
        bytify(80, valBytes),
      ]),
    ];

    const val0 = 0;
    const val1 = 1;
    const arg0 = 2;
    const arg1 = 3;

    // prettier-ignore
    const sources = [
      concat([ // sourceIndex === 0 (main source)
          op(Opcode.CONSTANT, val0),
          op(Opcode.CONSTANT, val1),
        op(Opcode.ZIPMAP, zipmapSize(sourceIndex, loopSize, valSize)),
      ]),
      concat([ // sourceIndex === 1 (inner ZIPMAP function)
        // (arg0 arg1 mul) (arg0 arg1 add)
          op(Opcode.CONSTANT, arg0),
          op(Opcode.CONSTANT, arg1),
        op(Opcode.MUL, 2),
          op(Opcode.CONSTANT, arg0),
          op(Opcode.CONSTANT, arg1),
        op(Opcode.ADD, 2),
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
    const resultState = (await logic.state()) as VMStateStruct;

    // We're not expecting a single result here.
    // The first 16 positions in the stack should match our expected output.
    const expectedStack = [
      640, 88, 490, 77, 360, 66, 250, 55, 160, 44, 90, 33, 40, 22, 10, 11,
    ];

    // + 10 1 => 11
    // * 10 1 => 10
    // + 20 2 => 22
    // * 20 2 => 40
    // + 30 3 => 33
    // * 30 3 => 90
    // + 40 4 => 44
    // * 40 4 => 160
    // + 50 5 => 55
    // * 50 5 => 250
    // + 60 6 => 66
    // * 60 6 => 360
    // + 70 7 => 77
    // * 70 7 => 490
    // + 80 8 => 88
    // * 80 8 => 640

    for (let i = 0; i < parseInt(resultState.stackIndex.toString(), 10); i++) {
      const stackEl = resultState.stack[i];

      assert(
        ethers.BigNumber.from(stackEl).eq(expectedStack[i]),
        `wrong result of zipmap
        index     ${i}
        expected  ${expectedStack[i]}
        got       ${stackEl}`
      );
    }
  });

  it("should handle a zipmap which loops twice", async () => {
    // zero-based counting
    const sourceIndex = 1;
    const loopSize = 1;
    const valSize = 2;

    const valBytes = 32 / Math.pow(2, loopSize); // 128-bit unsigned

    const constants = [
      concat([bytify(3, valBytes), bytify(1, valBytes)]),
      concat([bytify(4, valBytes), bytify(2, valBytes)]),
      concat([bytify(5, valBytes), bytify(3, valBytes)]),
    ];

    const arg0 = 3;
    const arg1 = 4;
    const arg2 = 5;

    // prettier-ignore
    const sources = [
      concat([
          op(Opcode.CONSTANT, 2),
          op(Opcode.CONSTANT, 1),
          op(Opcode.CONSTANT, 0),
        op(Opcode.ZIPMAP, zipmapSize(sourceIndex, loopSize, valSize)),
      ]),
      concat([
        // (arg0 arg1 arg2 mul) (arg0 arg1 arg2 add)
          op(Opcode.CONSTANT, arg0),
          op(Opcode.CONSTANT, arg1),
          op(Opcode.CONSTANT, arg2),
        op(Opcode.MUL, 3),
          op(Opcode.CONSTANT, arg0),
          op(Opcode.CONSTANT, arg1),
          op(Opcode.CONSTANT, arg2),
        op(Opcode.ADD, 3),
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
    const resultState = (await logic.state()) as VMStateStruct;

    const expectedMul1 = 6;
    const actualMul1 = ethers.BigNumber.from(resultState.stack[0]);
    assert(
      actualMul1.eq(expectedMul1),
      `wrong result of zipmap (1 2 3 *)
      expected  ${expectedMul1}
      got       ${actualMul1}`
    );

    const expectedAdd1 = 6;
    const actualAdd1 = ethers.BigNumber.from(resultState.stack[1]);
    assert(
      actualAdd1.eq(expectedAdd1),
      `wrong result of zipmap (1 2 3 +)
      expected  ${expectedAdd1}
      got       ${actualAdd1}`
    );

    const expectedMul0 = 60;
    const actualMul0 = ethers.BigNumber.from(resultState.stack[2]);
    assert(
      actualMul0.eq(expectedMul0),
      `wrong result of zipmap (3 4 5 *)
      expected  ${expectedMul0}
      got       ${actualMul0}`
    );

    const expectedAdd0 = 12;
    const actualAdd0 = ethers.BigNumber.from(resultState.stack[3]);
    assert(
      actualAdd0.eq(expectedAdd0),
      `wrong result of zipmap (3 4 5 +)
      expected  ${expectedAdd0}
      got       ${actualAdd0}`
    );
  });

  it("should handle a zipmap op with maxed sourceIndex and valSize", async () => {
    const constants = [10, 20, 30, 40, 50, 60, 70, 80];

    const a0 = op(Opcode.CONSTANT, 8);
    const a1 = op(Opcode.CONSTANT, 9);
    const a2 = op(Opcode.CONSTANT, 10);
    const a3 = op(Opcode.CONSTANT, 11);
    const a4 = op(Opcode.CONSTANT, 12);
    const a5 = op(Opcode.CONSTANT, 13);
    const a6 = op(Opcode.CONSTANT, 14);
    const a7 = op(Opcode.CONSTANT, 15);

    // zero-based counting
    const sourceIndex = 1;
    const loopSize = 0; // no subdivision of uint256, normal constants
    const valSize = 7;

    // prettier-ignore
    const sources = [
      concat([
          op(Opcode.CONSTANT, 0),
          op(Opcode.CONSTANT, 1),
          op(Opcode.CONSTANT, 2),
          op(Opcode.CONSTANT, 3),
          op(Opcode.CONSTANT, 4),
          op(Opcode.CONSTANT, 5),
          op(Opcode.CONSTANT, 6),
          op(Opcode.CONSTANT, 7),
        op(Opcode.ZIPMAP, zipmapSize(sourceIndex, loopSize, valSize)),
      ]),
      concat([
        // (arg0 arg1 arg2 ... add) (arg0 arg1 arg2 ... add)
          a0,
          a1,
          a2,
          a3,
          a4,
          a5,
          a6,
          a7,
          a0,
          a1,
          a2,
          a3,
          a4,
          a5,
          a6,
          a7,
          a0,
          a1,
          a2,
          a3,
          a4,
          a5,
          a6,
          a7,
          a0,
          a1,
          a2,
          a3,
          a4,
          a5,
          a6,
          a7,
        op(Opcode.ADD, 32), // max no. items
          a0,
          a1,
          a2,
          a3,
          a4,
          a5,
          a6,
          a7,
          a0,
          a1,
          a2,
          a3,
          a4,
          a5,
          a6,
          a7,
          a0,
          a1,
          a2,
          a3,
          a4,
          a5,
          a6,
          a7,
          a0,
          a1,
          a2,
          a3,
          a4,
          a5,
        op(Opcode.ADD, 30),
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
    const resultState = (await logic.state()) as VMStateStruct;

    const expectedIndex = 2;
    const actualIndex = ethers.BigNumber.from(resultState.stackIndex);
    assert(
      actualIndex.eq(expectedIndex),
      `wrong index for zipmap
      expected  ${expectedIndex}
      got       ${actualIndex}`
    );

    const expectedAdd1 = 1440; // first add
    const actualAdd1 = ethers.BigNumber.from(resultState.stack[0]);
    assert(
      actualAdd1.eq(expectedAdd1),
      `wrong result of zipmap
      expected  ${expectedAdd1}
      got       ${actualAdd1}`
    );

    const expectedAdd0 = 1290; // second add
    const actualAdd0 = ethers.BigNumber.from(resultState.stack[1]);
    assert(
      actualAdd0.eq(expectedAdd0),
      `wrong result of zipmap
      expected  ${expectedAdd0}
      got       ${actualAdd0}`
    );
  });

  it("should handle a zipmap op which runs multiple functions (across multiple fn vals)", async () => {
    const constants = [1, 2, 3];
    const v0 = op(Opcode.CONSTANT, 0);
    const v1 = op(Opcode.CONSTANT, 1);
    const v2 = op(Opcode.CONSTANT, 2);

    const a0 = op(Opcode.CONSTANT, 3);
    const a1 = op(Opcode.CONSTANT, 4);
    const a2 = op(Opcode.CONSTANT, 5);

    // zero-based counting
    const sourceIndex = 1;
    const loopSize = 0;
    const valSize = 2;

    // prettier-ignore
    const sources = [
      concat([
          v0,
          v1,
          v2,
        op(Opcode.ZIPMAP, zipmapSize(sourceIndex, loopSize, valSize)),
      ]),
      concat([
        // (arg0 arg1 arg2 mul) (arg1 arg2 arg0 arg1 arg2 ... add)
          a0,
          a1,
          a2,
        op(Opcode.MUL, 3),
          a1,
          a2,
          a0,
          a1,
          a2,
          a0,
          a1,
          a2,
          a0,
          a1,
          a2,
          a0,
          a1,
          a2,
        op(Opcode.ADD, 14),
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
    const resultState = (await logic.state()) as VMStateStruct;

    const expectedIndex = 2;
    const actualIndex = ethers.BigNumber.from(resultState.stackIndex);
    assert(
      actualIndex.eq(expectedIndex),
      `wrong index for zipmap
      expected  ${expectedIndex}
      got       ${actualIndex}`
    );

    const expectedMul = 6;
    const actualMul = ethers.BigNumber.from(resultState.stack[0]);
    assert(
      actualMul.eq(expectedMul),
      `wrong result of zipmap mul
      expected  ${expectedMul}
      got       ${actualMul}`
    );

    const expectedAdd = 29;
    const actualAdd = ethers.BigNumber.from(resultState.stack[1]);
    assert(
      actualAdd.eq(expectedAdd),
      `wrong result of zipmap add
      expected  ${expectedAdd}
      got       ${actualAdd}`
    );
  });

  it("should handle a zipmap which runs multiple functions (using single inner zipmap function source)", async () => {
    const constants = [3, 4, 5];
    const v3 = op(Opcode.CONSTANT, 0);
    const v4 = op(Opcode.CONSTANT, 1);
    const v5 = op(Opcode.CONSTANT, 2);

    const a0 = op(Opcode.CONSTANT, 3);
    const a1 = op(Opcode.CONSTANT, 4);
    const a2 = op(Opcode.CONSTANT, 5);

    // zero-based counting
    const sourceIndex = 1;
    const loopSize = 0;
    const valSize = 2;

    // prettier-ignore
    const sources = [
      concat([
          v3,
          v4,
          v5,
        op(Opcode.ZIPMAP, zipmapSize(sourceIndex, loopSize, valSize)),
      ]),
      concat([
        // inner zipmap function source
        // (arg0 arg1 arg2 mul) (arg0 arg1 ar2 add)
          a0,
          a1,
          a2,
        op(Opcode.MUL, 3),
          a0,
          a1,
          a2,
        op(Opcode.ADD, 3),
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
    const resultState = (await logic.state()) as VMStateStruct;

    const expectedIndex = 2;
    const actualIndex = ethers.BigNumber.from(resultState.stackIndex);
    assert(
      actualIndex.eq(expectedIndex),
      `wrong index for zipmap
      expected  ${expectedIndex}
      got       ${actualIndex}`
    );

    const expectedMul = 60;
    const actualMul = ethers.BigNumber.from(resultState.stack[0]);
    assert(
      actualMul.eq(expectedMul),
      `wrong result of zipmap (3 4 5 *)
      expected  ${expectedMul}
      got       ${actualMul}`
    );

    const expectedAdd = 12;
    const actualAdd = ethers.BigNumber.from(resultState.stack[1]);
    assert(
      actualAdd.eq(expectedAdd),
      `wrong result of zipmap (3 4 5 +)
      expected  ${expectedAdd}
      got       ${actualAdd}`
    );
  });

  it("should handle a simple zipmap", async () => {
    const constants = [1, 2, 3];
    const v1 = op(Opcode.CONSTANT, 0);
    const v2 = op(Opcode.CONSTANT, 1);
    const v3 = op(Opcode.CONSTANT, 2);

    const a0 = op(Opcode.CONSTANT, 3);
    const a1 = op(Opcode.CONSTANT, 4);
    const a2 = op(Opcode.CONSTANT, 5);

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
          a2,
        op(Opcode.ADD, 3),
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
    const result = await logic.stackTop();
    const expected = 6;
    assert(
      result.eq(expected),
      `wrong result of zipmap
      expected  ${expected}
      got       ${result}`
    );
  });

  it.only("should handle combo ops script", async () => {
    const signers = await ethers.getSigners();

    const alwaysTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [op(Opcode.CONSTANT, 0), op(Opcode.CONSTANT, 0)],
        constants: [ALWAYS],
      },
    })) as CombineTier;

	const price = "10";
	const maxPercent = 100;
	const discountsPercents = paddedUInt256(
		BigNumber.from(
			"0x" +
			paddedUInt32(maxPercent - 40) +
			paddedUInt32(maxPercent - 35) +
			paddedUInt32(maxPercent - 30) +
			paddedUInt32(maxPercent - 25) +
			paddedUInt32(maxPercent - 20) +
			paddedUInt32(maxPercent - 15) +
			paddedUInt32(maxPercent - 10) +
			paddedUInt32(maxPercent - 5)
		)
	);

	const constants = [
		price,
		ethers.constants.MaxUint256,
		alwaysTier.address,
		discountsPercents,
		maxPercent
	];

	const sources = [
		concat([
			op(Opcode.CONSTANT, 0), // 1
			op(Opcode.CONSTANT, 1), // 2
			op(Opcode.CONSTANT, 4), // 3
			op(Opcode.UPDATE_TIMES_FOR_TIER_RANGE, tierRange(Tier.ZERO, Tier.EIGHT)), // 2
        op(Opcode.BLOCK_TIMESTAMP), // 5
        op(Opcode.CONSTANT, 3), // 3
          op(Opcode.CONSTANT, 2), // 4
          op(Opcode.SENDER), // 5
        op(Opcode.ITIERV2_REPORT), // 4
			op(Opcode.SELECT_LTE, selectLte(selectLteLogic.every, selectLteMode.first, 2)), // 3
			op(Opcode.SATURATING_DIFF), // 2

			op(Opcode.ZIPMAP, zipmapSize(1, 3, 0)),
			op(Opcode.MIN, 8),
			op(Opcode.MUL, 2),
			op(Opcode.CONSTANT, 3),
			op(Opcode.DIV, 2),
		]),
		concat([
			op(Opcode.CONSTANT, 4),
			op(Opcode.CONSTANT, 5),
			op(Opcode.SUB, 2),
		])
	];

  console.log(op(Opcode.ITIERV2_REPORT))

	await logic.initialize({ sources, constants });

	await logic.connect(signers[0]).run();
    const result = await logic.stackTop();

    const expected = 10 * (60 / 100);

    assert(
      result.eq(expected),
      `price did not received correct discount
      expected  ${expected}
      got       ${result}`
    );
  });
});
