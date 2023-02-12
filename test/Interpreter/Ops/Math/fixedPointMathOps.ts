import { assert } from "chai";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import {
  eighteenZeros,
  ONE,
  sixteenZeros,
  sixZeros,
  tenZeros,
} from "../../../../utils/constants";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";

import { Parser } from "rainlang";
import { getRainterpreterOpMetaBytes } from "../../../../utils/meta/op/allStandardOpMeta";

describe("RainInterpreter fixed point math ops", async function () {
  let rainInterpreter: Rainterpreter;
  let logic: IInterpreterV1Consumer;

  const ROUNDING_UP = 1;
  const ROUNDING_DOWN = 0;

  before(async () => {
    rainInterpreter = await rainterpreterDeploy();

    const consumerFactory = await ethers.getContractFactory(
      "IInterpreterV1Consumer"
    );
    logic = (await consumerFactory.deploy()) as IInterpreterV1Consumer;
    await logic.deployed();
  });

  it("should scale an arbitrary fixed point number DOWN by scale N", async () => {
    const value1 = ethers.BigNumber.from(1 + sixZeros);
    const n = 0xfc; // -4

    const expressionString = `_: scale-by<${n}>(${value1});`;

    const stateConfig = Parser.getStateConfig(
      expressionString,
      getRainterpreterOpMetaBytes()
    );

    const expression0 = await expressionConsumerDeploy(
      stateConfig,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );

    const result0 = await logic.stackTop();
    const expected0 = ethers.BigNumber.from(100);

    assert(
      result0.eq(expected0),
      `wrong result
      expected  ${expected0}
      got       ${result0}`
    );
  });

  it("should scale an arbitrary fixed point number UP by scale N", async () => {
    const value1 = ethers.BigNumber.from(1 + sixZeros);
    const n = 0x04; // 4

    const expressionString = `_: scale-by<${n}>(${value1});`;

    const stateConfig = Parser.getStateConfig(
      expressionString,
      getRainterpreterOpMetaBytes()
    );

    const expression0 = await expressionConsumerDeploy(
      stateConfig,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );

    const result0 = await logic.stackTop();
    const expected0 = ethers.BigNumber.from(1 + sixZeros + "0000");

    assert(
      result0.eq(expected0),
      `wrong result
      expected  ${expected0}
      got       ${result0}`
    );
  });

  it("should scale an 18 OOMs number UP to scale N", async () => {
    const value1 = ethers.BigNumber.from(1 + eighteenZeros);
    const n = 20;

    const expressionString = `_: scale-n<${n}>(${value1});`;

    const stateConfig = Parser.getStateConfig(
      expressionString,
      getRainterpreterOpMetaBytes()
    );

    const expression0 = await expressionConsumerDeploy(
      stateConfig,
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
    const expressionString = `_: scale-n<${n}>(${value1});`;

    const stateConfig = Parser.getStateConfig(
      expressionString,
      getRainterpreterOpMetaBytes()
    );

    const expression0 = await expressionConsumerDeploy(
      stateConfig,
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

  it("should scale a number by 18 OOM while dividing", async () => {
    const value1 = 50;
    const value2 = ethers.BigNumber.from("3" + eighteenZeros);

    const expressionString = `_: scale18-div<0>(${value1} ${value2});`;

    const stateConfig = Parser.getStateConfig(
      expressionString,
      getRainterpreterOpMetaBytes()
    );

    const expression0 = await expressionConsumerDeploy(
      stateConfig,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );

    const result0 = await logic.stackTop();
    const expected0 = ethers.BigNumber.from(value1 + eighteenZeros)
      .mul(ONE)
      .div(value2);
    assert(
      result0.eq(expected0),
      `wrong result
      expected  ${expected0}
      got       ${result0}`
    );
  });

  it("should scale a number by 18 OOM while multiplying", async () => {
    const value1 = 1;
    const value2 = ONE.mul(2);

    const expressionString = `_: scale18-mul<0>(${value1} ${value2});`;

    const stateConfig = Parser.getStateConfig(
      expressionString,
      getRainterpreterOpMetaBytes()
    );

    const expression0 = await expressionConsumerDeploy(
      stateConfig,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );

    const result0 = await logic.stackTop();
    const expected0 = ethers.BigNumber.from(value1 + eighteenZeros)
      .mul(value2)
      .div(ONE);
    assert(
      result0.eq(expected0),
      `wrong result
      expected  ${expected0}
      got       ${result0}`
    );
  });

  it("should scale a number UP to 18 OOM", async () => {
    const value = ethers.BigNumber.from("100245700");

    // prettier-ignore
    const expressionString = `_: scale-18<${ROUNDING_UP} 8>(${value});`;

    const stateConfig = Parser.getStateConfig(
      expressionString,
      getRainterpreterOpMetaBytes()
    );

    const expression0 = await expressionConsumerDeploy(
      stateConfig,
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

    // prettier-ignore
    const expressionString = `_: scale18<${ROUNDING_UP} 24>(${value});`;

    const stateConfig = Parser.getStateConfig(
      expressionString,
      getRainterpreterOpMetaBytes()
    );

    const expression0 = await expressionConsumerDeploy(
      stateConfig,
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

    // prettier-ignore
    const expressionString = `_: scale18<${ROUNDING_UP} 20>(${value});`;

    const stateConfig = Parser.getStateConfig(
      expressionString,
      getRainterpreterOpMetaBytes()
    );

    const expression0 = await expressionConsumerDeploy(
      stateConfig,
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
  });

  it("should scale a number DOWN to 18 OOM with ROUNDING DOWN", async () => {
    const value = ethers.BigNumber.from(1 + sixteenZeros + "7534567");

    // prettier-ignore
    const expressionString = `_: scale18<${ROUNDING_DOWN} 20>(${value});`;

    const stateConfig = Parser.getStateConfig(
      expressionString,
      getRainterpreterOpMetaBytes()
    );

    const expression0 = await expressionConsumerDeploy(
      stateConfig,
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
  });

  it("should scale a number UP to 18 OOM on a dynamic scale", async () => {
    const decimals = 8;
    const value = ethers.BigNumber.from("100245700");

    // prettier-ignore
    const expressionString = `_: scale-18-dynamic<${ROUNDING_UP}>(${decimals} ${value});`;

    const stateConfig = Parser.getStateConfig(
      expressionString,
      getRainterpreterOpMetaBytes()
    );

    const expression0 = await expressionConsumerDeploy(
      stateConfig,
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

    // prettier-ignore
    const expressionString = `_: scale-18-dynamic<${ROUNDING_UP}>(${decimals} ${value});`;

    const stateConfig = Parser.getStateConfig(
      expressionString,
      getRainterpreterOpMetaBytes()
    );

    const expression0 = await expressionConsumerDeploy(
      stateConfig,
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

    // prettier-ignore
    const expressionString = `_: scale-18-dynamic<${ROUNDING_UP}>(${decimals} ${value});`;

    const stateConfig = Parser.getStateConfig(
      expressionString,
      getRainterpreterOpMetaBytes()
    );

    const expression0 = await expressionConsumerDeploy(
      stateConfig,
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

    // prettier-ignore
    const expressionString = `_: scale-18-dynamic<${ROUNDING_DOWN}>(${decimals} ${value});`;

    const stateConfig = Parser.getStateConfig(
      expressionString,
      getRainterpreterOpMetaBytes()
    );

    const expression0 = await expressionConsumerDeploy(
      stateConfig,
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
});
