import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { Rainterpreter, RainterpreterStore } from "../../../../typechain";
import {
  rainterpreterDeploy,
  rainterpreterStoreDeploy,
} from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import {
  standardEvaluableConfig,
  compileSource,
  opMetaHash,
} from "../../../../utils";
import { rainlang } from "../../../../utils/extensions/rainlang";
import assert from "assert";

describe("Rainterpreter offchainDebugEval tests", async function () {
  let rainterpreter: Rainterpreter;
  let store: RainterpreterStore;
  let pointers: string;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);
    rainterpreter = await rainterpreterDeploy();
    store = await rainterpreterStoreDeploy();
    pointers = await rainterpreter.functionPointers();
  });

  it("should debug for simple expressions using offchainDebugEval", async () => {
    const { sources: sources0, constants: constants0 } =
      await standardEvaluableConfig(rainlang`
        @${opMetaHash}

        _: add(1 2 3),
        : set(123 4),
        _: any(0 2 0);
    `);

    const compiledSource0 = [];
    sources0.forEach((source) => {
      compiledSource0.push(compileSource(source, pointers));
    });

    const result0: [BigNumber[], BigNumber[]] =
      await rainterpreter.offchainDebugEval(
        store.address,
        0,
        compiledSource0,
        constants0,
        [[]],
        [0, 0, 0, 0],
        0
      );

    const expectedResult0: [BigNumber[], BigNumber[]] = [
      [BigNumber.from(6), BigNumber.from(2)],
      [BigNumber.from(123), BigNumber.from(4)],
    ];

    assert.deepEqual(result0, expectedResult0);

    const { sources: sources1, constants: constants1 } =
      await standardEvaluableConfig(rainlang`
        @${opMetaHash}

       _: hash(${ethers.constants.MaxUint256});
    `);

    const compiledSource1 = [];
    sources1.forEach((source) => {
      compiledSource1.push(compileSource(source, pointers));
    });

    const result1: [BigNumber[], BigNumber[]] =
      await rainterpreter.offchainDebugEval(
        store.address,
        0,
        compiledSource1,
        constants1,
        [[]],
        [0],
        0
      );

    const expectedResult1: [BigNumber[], BigNumber[]] = [
      [
        BigNumber.from(
          ethers.utils.solidityKeccak256(["uint256[]"], [constants1])
        ),
      ],
      [],
    ];

    assert.deepEqual(result1, expectedResult1);

    const { sources: sources2, constants: constants2 } =
      await standardEvaluableConfig(rainlang`
        @${opMetaHash}

       value0: context<0 0>(),
      value1: context<0 1>(),
      _: hash(value0 value1);
    `);
    const context2 = [[0xfffffffffff, 0x12031]];

    const compiledSource2 = [];
    sources2.forEach((source) => {
      compiledSource2.push(compileSource(source, pointers));
    });

    const result2: [BigNumber[], BigNumber[]] =
      await rainterpreter.offchainDebugEval(
        store.address,
        0,
        compiledSource2,
        constants2,
        context2,
        [0, 0, 0, 0],
        0
      );

    const expectedResult2: [BigNumber[], BigNumber[]] = [
      [
        BigNumber.from(context2[0][0]),
        BigNumber.from(context2[0][1]),
        BigNumber.from(
          ethers.utils.solidityKeccak256(["uint256[]"], [context2[0]])
        ),
      ],
      [],
    ];
    assert.deepEqual(result2, expectedResult2);

    const { sources: sources3, constants: constants3 } =
      await standardEvaluableConfig(rainlang`
        @${opMetaHash}

      _ _: set(1337 1) get(1337) set(1337 2) get(1337);
    `);

    const compiledSource3 = [];
    sources3.forEach((source) => {
      compiledSource3.push(compileSource(source, pointers));
    });

    const result3: [BigNumber[], BigNumber[]] =
      await rainterpreter.offchainDebugEval(
        store.address,
        0,
        compiledSource3,
        constants3,
        [[]],
        [0, 0, 0],
        0
      );

    const expectedResult3: [BigNumber[], BigNumber[]] = [
      [BigNumber.from(1), BigNumber.from(2)],
      [BigNumber.from(1337), BigNumber.from(2)],
    ];

    assert.deepEqual(result3, expectedResult3);
  });

  it("should debug multiple sources", async () => {
    const { sources: sources0, constants: constants0 } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}

        /* main source 0 */
        _ _:  call<1 2>(10);

        /* source 1 */
        ten: ,
        twenty: 20,
        _ _:  ten twenty;
        `
      );

    const compiledSource0 = [];
    sources0.forEach((source) => {
      compiledSource0.push(compileSource(source, pointers));
    });

    const result0: [BigNumber[], BigNumber[]] =
      await rainterpreter.offchainDebugEval(
        store.address,
        0,
        compiledSource0,
        constants0,
        [[]],
        [0, 0, 0, 0],
        0
      );

    const expectedResult0: [BigNumber[], BigNumber[]] = [
      [BigNumber.from(10), BigNumber.from(20)],
      [],
    ];

    assert.deepEqual(result0, expectedResult0);

    const { sources: sources1, constants: constants1 } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}

        /*
          sourceMain
        */
        c0: 0,
        c1: 0,
        condition: call<2 1>(c1), /* callCheckAcc */
        _ _: do-while<1>(c0 c1 condition);

        /* sourceWHILE */
        s0 s1: ,
        o0 o1: call<3 2>(s0 s1),
        condition: call<2 1>(o1); /* callCheckAcc */

        /* sourceCheckAcc */
        s0: ,
        _: less-than(s0 20);

        /* sourceIncrease */
        s0 s1: ,
        _: add(s0 1),
        _: add(s1 3);
      `
      );

    const compiledSource1 = [];
    sources1.forEach((source) => {
      compiledSource1.push(compileSource(source, pointers));
    });

    const result1: [BigNumber[], BigNumber[]] =
      await rainterpreter.offchainDebugEval(
        store.address,
        0,
        compiledSource1,
        constants1,
        [[]],
        [0, 0, 0, 0, 0],
        3
      );

    const expectedResult1: [BigNumber[], BigNumber[]] = [
      [BigNumber.from(1), BigNumber.from(4)],
      [],
    ];

    assert.deepEqual(result1, expectedResult1);
  });
});
