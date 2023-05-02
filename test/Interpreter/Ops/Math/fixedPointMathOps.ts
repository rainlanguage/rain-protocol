import { strict as assert } from "assert";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import { assertError, standardEvaluableConfig } from "../../../../utils";
import {
  eighteenZeros,
  max_uint256,
  sixteenZeros,
  sixZeros,
  tenZeros,
} from "../../../../utils/constants";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { rainlang } from "../../../../utils/extensions/rainlang";

describe("RainInterpreter fixed point math ops", async function () {
  let rainInterpreter: Rainterpreter;
  let logic: IInterpreterV1Consumer;

  const ROUNDING_UP = 1;
  const ROUNDING_DOWN = 0;

  const SATURATE_ON = 1;
  const SATURATE_OFF = 0;

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

  it("should scale an 18 OOMs number UP to scale N", async () => {
    const value1 = ethers.BigNumber.from(1 + eighteenZeros);
    const n = 20;

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`_: scale-n<${n} ${SATURATE_OFF} ${ROUNDING_DOWN}>(${value1});`
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
    const expected0 = ethers.BigNumber.from(1 + eighteenZeros + "00");

    assert(
      result0.eq(expected0),
      `wrong result
        expected  ${expected0}
        got       ${result0}`
    );
  });

  it("should scale an 18 OOMs number DOWN to scale N", async () => {
    const value1 = ethers.BigNumber.from(1 + eighteenZeros);
    const n = 6;

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`_: scale-n<${n} ${SATURATE_OFF} ${ROUNDING_DOWN}>(${value1});`
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
    const expected0 = ethers.BigNumber.from(1 + sixZeros);

    assert(
      result0.eq(expected0),
      `wrong result
        expected  ${expected0}
        got       ${result0}`
    );
  });

  it("should not scale an 18 OOM number using scale N if N matches fixed point decimals", async () => {
    const value1 = ethers.BigNumber.from(1 + eighteenZeros);
    const n = 18;

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`_: scale-n<${n} ${SATURATE_OFF} ${ROUNDING_DOWN}>(${value1});`
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
    const expected0 = ethers.BigNumber.from(1 + eighteenZeros);

    assert(
      result0.eq(expected0),
      `wrong result
        expected  ${expected0}
        got       ${result0}`
    );
  });

  it("should round up the result using scale N while scaling down", async () => {
    const value1 = ethers.BigNumber.from(1 + sixZeros);
    const n = 7;

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`_: scale-n<${n} ${SATURATE_OFF} ${ROUNDING_UP}>(${value1});`
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
    const expected0 = 1;

    assert(
      result0.eq(expected0),
      `wrong result
        expected  ${expected0}
        got       ${result0}`
    );
  });

  it("should round down the result using scale N while scaling down", async () => {
    const value1 = ethers.BigNumber.from(1 + sixZeros);
    const n = 7;

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`_: scale-n<${n} ${SATURATE_OFF} ${ROUNDING_DOWN}>(${value1});`
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
    const expected0 = 0;

    assert(
      result0.eq(expected0),
      `wrong result
        expected  ${expected0}
        got       ${result0}`
    );
  });

  it("should saturate a value using scale N if the resultant value overflows", async () => {
    let value = ethers.BigNumber.from(1 + "0".repeat(72));
    let n = 24; // overflows

    const { sources: sources0, constants: constants0 } =
      await standardEvaluableConfig(
        rainlang`_: scale-n<${n} ${SATURATE_ON} ${ROUNDING_UP}>(${value});`
      );

    const expression0 = await expressionConsumerDeploy(
      sources0,
      constants0,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );

    const result0 = await logic.stackTop();
    const expected0 = max_uint256;

    assert(
      result0.eq(expected0),
      `wrong result
        expected  ${expected0}
        got       ${result0}`
    );

    n = 16383; // (targetDecimals - FIXED_POINT_DECIMALS) >= OVERFLOW_RESCALE_OOMS
    const { sources: sources1, constants: constants1 } =
      await standardEvaluableConfig(
        rainlang`_: scale-n<${n} ${SATURATE_ON} ${ROUNDING_UP}>(${value});`
      );

    const expression1 = await expressionConsumerDeploy(
      sources1,
      constants1,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression1.dispatch,
      []
    );

    const result1 = await logic.stackTop();
    const expected1 = max_uint256;

    assert(
      result1.eq(expected1),
      `wrong result
        expected  ${expected1}
        got       ${result1}`
    );

    value = ethers.BigNumber.from(0);
    const { sources: sources2, constants: constants2 } =
      await standardEvaluableConfig(
        rainlang`_: scale-n<${n} ${SATURATE_ON} ${ROUNDING_UP}>(${value});`
      );

    const expression2 = await expressionConsumerDeploy(
      sources2,
      constants2,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression2.dispatch,
      []
    );

    const result2 = await logic.stackTop();
    const expected2 = 0;

    assert(
      result2.eq(expected2),
      `wrong result
        expected  ${expected2}
        got       ${result2}`
    );
  });

  it("should revert with an overflow using scale N if the resultant value overflows", async () => {
    const value1 = ethers.BigNumber.from(1 + "0".repeat(72));
    const n = 24; // overflows

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`_: scale-n<${n} ${SATURATE_OFF} ${ROUNDING_UP}>(${value1});`
    );

    const expression0 = await expressionConsumerDeploy(
      sources,
      constants,

      rainInterpreter,
      1
    );

    await assertError(
      async () =>
        await logic["eval(address,uint256,uint256[][])"](
          rainInterpreter.address,
          expression0.dispatch,
          []
        ),
      "Arithmetic operation underflowed or overflowed outside of an unchecked block",
      "Did not revert with an overflow"
    );
  });

  it("should scale a number UP to 18 OOM", async () => {
    const value = ethers.BigNumber.from("100245700");

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`_: scale-18<8 ${SATURATE_OFF} ${ROUNDING_UP}>(${value});`
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

    const expected0 = ethers.BigNumber.from("100245700" + tenZeros);
    assert(
      result0.eq(expected0),
      `wrong result
        expected  ${expected0}
        got       ${result0}`
    );
  });

  it("should scale a number DOWN to 18 OOM", async () => {
    const value = ethers.BigNumber.from(1 + eighteenZeros + sixZeros);

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`_: scale-18<24 ${SATURATE_OFF} ${ROUNDING_UP}>(${value});`
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

    const expected0 = ethers.BigNumber.from(1 + eighteenZeros);
    assert(
      result0.eq(expected0),
      `wrong result
        expected  ${expected0}
        got       ${result0}`
    );
  });

  it("should scale a number DOWN to 18 OOM with ROUNDING UP", async () => {
    const value = ethers.BigNumber.from(1 + sixteenZeros + "7534567");

    const { sources: sources0, constants: constants0 } =
      await standardEvaluableConfig(
        rainlang`_: scale-18<20 ${SATURATE_OFF} ${ROUNDING_UP}>(${value});`
      );

    const expression0 = await expressionConsumerDeploy(
      sources0,
      constants0,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );

    const result0 = await logic.stackTop();

    const expected0 = ethers.BigNumber.from(1 + sixteenZeros + "75345").add(
      ethers.BigNumber.from(1)
    );
    assert(
      result0.eq(expected0),
      `wrong result
        expected  ${expected0}
        got       ${result0}`
    );

    const { sources: sources1, constants: constants1 } =
      await standardEvaluableConfig(
        rainlang`_: scale-18<16383 ${SATURATE_OFF} ${ROUNDING_UP}>(${value});`
      );

    const expression1 = await expressionConsumerDeploy(
      sources1,
      constants1,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression1.dispatch,
      []
    );

    const result1 = await logic.stackTop();
    const expected1 = 1;

    assert(
      result1.eq(expected1),
      `wrong result
        expected  ${expected1}
        got       ${result1}`
    );

    const { sources: sources2, constants: constants2 } =
      await standardEvaluableConfig(
        rainlang`_: scale-18<16383 ${SATURATE_OFF} ${ROUNDING_UP}>(0);`
      );

    const expression2 = await expressionConsumerDeploy(
      sources2,
      constants2,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression2.dispatch,
      []
    );

    const result2 = await logic.stackTop();
    const expected2 = 0;

    assert(
      result2.eq(expected2),
      `wrong result
        expected  ${expected2}
        got       ${result2}`
    );
  });

  it("should scale a number DOWN to 18 OOM with ROUNDING DOWN", async () => {
    const value = ethers.BigNumber.from(1 + sixteenZeros + "7534567");

    const { sources: sources0, constants: constants0 } =
      await standardEvaluableConfig(
        rainlang`_: scale-18<20 ${SATURATE_OFF} ${ROUNDING_DOWN}>(${value});`
      );

    const expression0 = await expressionConsumerDeploy(
      sources0,
      constants0,

      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );

    const result0 = await logic.stackTop();

    const expected0 = ethers.BigNumber.from(1 + sixteenZeros + "75345");
    assert(
      result0.eq(expected0),
      `wrong result
        expected  ${expected0}
        got       ${result0}`
    );

    const { sources: sources1, constants: constants1 } =
      await standardEvaluableConfig(
        rainlang`_: scale-18<16383 ${SATURATE_OFF} ${ROUNDING_DOWN}>(${value});`
      );

    const expression1 = await expressionConsumerDeploy(
      sources1,
      constants1,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression1.dispatch,
      []
    );

    const result1 = await logic.stackTop();
    const expected1 = 0;

    assert(
      result1.eq(expected1),
      `wrong result
        expected  ${expected1}
        got       ${result1}`
    );
  });

  it("should saturate if the resultant value overflows while scaling a number UP to 18 OOM", async () => {
    const value = ethers.BigNumber.from(1 + "0".repeat(72));

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`_: scale-18<8 ${SATURATE_ON} ${ROUNDING_UP}>(${value});`
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

    const expected0 = max_uint256;
    assert(
      result0.eq(expected0),
      `wrong result
        expected  ${expected0}
        got       ${result0}`
    );
  });

  it("should revert with an overflow if the resultant value overflows while scaling a number UP to 18 OOM", async () => {
    const value = ethers.BigNumber.from(1 + "0".repeat(72));

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`_: scale-18<8 ${SATURATE_OFF} ${ROUNDING_UP}>(${value});`
    );

    const expression0 = await expressionConsumerDeploy(
      sources,
      constants,

      rainInterpreter,
      1
    );

    await assertError(
      async () =>
        await logic["eval(address,uint256,uint256[][])"](
          rainInterpreter.address,
          expression0.dispatch,
          []
        ),
      "Arithmetic operation underflowed or overflowed outside of an unchecked block",
      "Did not revert with an overflow"
    );
  });

  it("should scale a number UP to 18 OOM on a dynamic scale", async () => {
    const decimals = 8;
    const value = ethers.BigNumber.from("100245700");

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`_: scale-18-dynamic<${SATURATE_OFF} ${ROUNDING_UP}>(${decimals} ${value});`
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

    const expected0 = ethers.BigNumber.from("100245700" + tenZeros);
    assert(
      result0.eq(expected0),
      `wrong result
        expected  ${expected0}
        got       ${result0}`
    );
  });

  it("should scale a number DOWN to 18 OOM on a dynamic scale", async () => {
    const decimals = 24;
    const value = ethers.BigNumber.from(1 + eighteenZeros + sixZeros);

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`_: scale-18-dynamic<${SATURATE_OFF} ${ROUNDING_UP}>(${decimals} ${value});`
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

    const expected0 = ethers.BigNumber.from(1 + eighteenZeros);
    assert(
      result0.eq(expected0),
      `wrong result
        expected  ${expected0}
        got       ${result0}`
    );
  });

  it("should scale a number DOWN to 18 OOM on a dynamic scale with ROUNDING UP", async () => {
    const decimals = 22;
    const value = ethers.BigNumber.from(1 + sixteenZeros + "726184");

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`_: scale-18-dynamic<${SATURATE_OFF} ${ROUNDING_UP}>(${decimals} ${value});`
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
    const expected0 = ethers.BigNumber.from(1 + sixteenZeros + "72").add(
      ethers.BigNumber.from(1)
    );
    assert(
      result0.eq(expected0),
      `wrong result
        expected  ${expected0}
        got       ${result0}`
    );
  });

  it("should scale a number DOWN to 18 OOM on a dynamic scale with ROUNDING DOWN", async () => {
    const decimals = 22;
    const value = ethers.BigNumber.from(1 + sixteenZeros + "726184");

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`_: scale-18-dynamic<${SATURATE_OFF} ${ROUNDING_DOWN}>(${decimals} ${value});`
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
    const expected0 = ethers.BigNumber.from(1 + sixteenZeros + "72");
    assert(
      result0.eq(expected0),
      `wrong result
        expected  ${expected0}
        got       ${result0}`
    );
  });

  it("should saturate if the resultant value overflows scaling a number UP to 18 OOM on a dynamic scale", async () => {
    const decimals = 8;
    const value = ethers.BigNumber.from(1 + "0".repeat(72));

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`_: scale-18-dynamic<${SATURATE_ON} ${ROUNDING_UP}>(${decimals} ${value});`
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

    const expected0 = max_uint256;
    assert(
      result0.eq(expected0),
      `wrong result
        expected  ${expected0}
        got       ${result0}`
    );
  });

  it("should revert with an overflow if the resultant value overflows scaling a number UP to 18 OOM on a dynamic scale", async () => {
    const decimals = 8;
    const value = ethers.BigNumber.from(1 + "0".repeat(72));

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`_: scale-18-dynamic<${SATURATE_OFF} ${ROUNDING_UP}>(${decimals} ${value});`
    );

    const expression0 = await expressionConsumerDeploy(
      sources,
      constants,

      rainInterpreter,
      1
    );

    await assertError(
      async () =>
        await logic["eval(address,uint256,uint256[][])"](
          rainInterpreter.address,
          expression0.dispatch,
          []
        ),
      "Arithmetic operation underflowed or overflowed outside of an unchecked block",
      "Did not revert with an overflow"
    );
  });
});
