import { strict as assert } from "assert";
import { randomBytes } from "crypto";
import { keccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  IInterpreterV1Consumer,
  Rainterpreter,
  RainterpreterStore,
} from "../../../../typechain";
import {
  opMetaHash,
  randomUint256,
  standardEvaluableConfig,
} from "../../../../utils";
import {
  rainterpreterDeploy,
  rainterpreterStoreDeploy,
} from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import {
  expressionConsumerDeploy,
  iinterpreterV1ConsumerDeploy,
} from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { rainlang } from "../../../../utils/extensions/rainlang";

describe("SET/GET Opcode tests", async function () {
  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);
  });
  it("should update the key in kvs array when same key is set more than once", async () => {
    const key1 = 100;
    const val1 = ethers.constants.MaxUint256;
    const val2 = 555;

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
        @${opMetaHash}
key1: ${key1},
      val1: ${val1},
      val2: ${val2},
      _ _: set(key1 val1) get(key1) set(key1 val2) get(key1);`
    );

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(sources, constants, 2);

    // Eval
    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      []
    );

    // Asserting KVs array
    const kvs = await consumerLogic["kvs()"]();
    assert(kvs.length == 2, "Invalid kvs length");
    assert(kvs[0].eq(key1), "Invalid Key set in kvs");
    assert(kvs[1].eq(val2), "Invalid Value set in kvs");

    // Asserting stack
    const stack = await consumerLogic.stack();
    assert(stack.length == 2, "Invalid stack length");
    assert(stack[0].eq(constants[1]), "Invalid value was SET / GET for key 1");
    assert(stack[1].eq(constants[2]), "Invalid value was SET / GET for key 1");
  });

  it("should set a key value pair and overwrite it", async () => {
    const key1 = 100;
    const val1 = ethers.constants.MaxUint256;
    const val2 = 555;

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
        @${opMetaHash}
key1: ${key1},
      val1: ${val1},
      val2: ${val2},
      _ _: set(key1 val1) get(key1) set(key1 val2) get(key1);`
    );

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(sources, constants, 2);

    // Eval
    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      []
    );

    const stack = await consumerLogic.stack();
    assert(stack.length == 2, "Invalid stack length");
    assert(stack[0].eq(constants[1]), "Invalid value was SET / GET for key 1");
    assert(stack[1].eq(constants[2]), "Invalid value was SET / GET for key 1");
  });

  it("should set and get multiple values", async () => {
    const key1 = 100;
    const key2 = 101;
    const key3 = 102;
    const val1 = ethers.constants.MaxUint256;
    const val2 = 0;
    const val3 = 555;

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
        @${opMetaHash}
key1: ${key1},
      key2: ${key2},
      key3: ${key3},
      val1: ${val1},
      val2: ${val2},
      val3: ${val3},
      _ _ _: set(key1 val1) get(key1) set(key2 val2) get(key2) set(key3 val3) get(key3);`
    );

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(sources, constants, 3);

    // Eval
    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      []
    );

    const stack = await consumerLogic.stack();
    assert(stack.length == 3, "Invalid stack length");
    assert(stack[0].eq(val1), "Invalid value was SET / GET for key 1");
    assert(stack[1].eq(val2), "Invalid value was SET / GET for key 2");
    assert(stack[2].eq(val3), "Invalid value was SET / GET for key 3");
  });

  it("should set and get values of different types", async () => {
    // Numeric values
    const key = 123;
    const val = 456;

    const { sources: sources0, constants: constants0 } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
key: ${key},
        val: ${val},
        _: set(key val) get(key);`
      );

    let { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(sources0, constants0, 1);

    // Eval
    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      []
    );

    const stack0 = await consumerLogic.stack();

    // StackPointer
    const val0_ = stack0[stack0.length - 1];

    assert(val0_.eq(val), "Invalid value was SET / GET");

    // Hashed Key Value pair
    const hashedKey = keccak256(randomBytes(32));
    const hashedValue = keccak256(randomBytes(256));

    const { sources: sources1, constants: constants1 } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
key: ${hashedKey},
        val: ${hashedValue},
        _: set(key val) get(key);`
      );

    ({ consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(sources1, constants1, 1));

    // Eval
    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      []
    );

    const stack1 = await consumerLogic.stack();

    const val1_ = stack1[stack1.length - 1];

    // StackPointer
    assert(
      val1_.eq(hashedValue),
      "Invalid value was SET / GET for hashed bytes"
    );

    // max numeric key value pair
    const maxKey = ethers.constants.MaxUint256;
    const maxValue = ethers.constants.MaxUint256;

    const { sources: sources2, constants: constants2 } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
key: ${maxKey},
        val: ${maxValue},
        _: set(key val) get(key);`
      );

    ({ consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(sources2, constants2, 1));

    // Eval
    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      []
    );

    const stack2 = await consumerLogic.stack();

    const val2_ = stack2[stack2.length - 1];

    // StackPointer
    assert(
      val2_.eq(maxValue),
      "Invalid value was SET / GET for max key value pair"
    );
    const signers = await ethers.getSigners();
    // address key value pair
    const addressKey = signers[0].address;
    const addressValue = signers[1].address;

    const { sources: sources3, constants: constants3 } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
key: ${addressKey},
        val: ${addressValue},
        _: set(key val) get(key);`
      );

    ({ consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(sources3, constants3, 1));

    // Eval
    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      []
    );

    const stack3 = await consumerLogic.stack();

    const val3_ = stack3[stack3.length - 1];

    // StackPointer
    assert(
      val3_.eq(addressValue),
      "Invalid value was SET / GET for string key value pair"
    );
  });

  it("should set a value", async () => {
    const key = 123;
    const val = 456;

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
        @${opMetaHash}
key: ${key},
      val: ${val},
      : set(key val);`
    );

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(sources, constants, 0);

    // Eval
    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      []
    );

    const kvs = await consumerLogic["kvs()"]();

    // StackPointer
    const key_ = kvs[0];
    const val_ = kvs[1];

    assert(key_.eq(key), "Invalid key");
    assert(val_.eq(val), "Invalid value");
  });
});

describe("SET/GET Opcode tests with eval namespace", async function () {
  let rainInterpreter: Rainterpreter;
  let consumerLogicA: IInterpreterV1Consumer;
  let consumerLogicB: IInterpreterV1Consumer;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);
  });

  beforeEach(async () => {
    rainInterpreter = await rainterpreterDeploy();
    const consumerFactory = await ethers.getContractFactory(
      "IInterpreterV1Consumer"
    );

    consumerLogicA = (await consumerFactory.deploy()) as IInterpreterV1Consumer;
    await consumerLogicA.deployed();

    consumerLogicB = (await consumerFactory.deploy()) as IInterpreterV1Consumer;
    await consumerLogicB.deployed();
  });

  it("should ensure that set adds keys to state changes array", async () => {
    const key = 123;
    const val = 456;

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
        @${opMetaHash}
key: ${key},
      val: ${val},
      : set(key val);`
    );

    const expressionA = await expressionConsumerDeploy(
      sources,
      constants,
      rainInterpreter,
      0
    );

    const interpreterStore: RainterpreterStore =
      await rainterpreterStoreDeploy();

    await consumerLogicA["eval(address,address,uint256,uint256[][])"](
      rainInterpreter.address,
      interpreterStore.address,
      expressionA.dispatch,
      []
    );

    const kvs_ = await consumerLogicA["kvs()"]();
    await consumerLogicA["set(address,uint256[])"](
      await consumerLogicA.store(),
      kvs_
    );

    // Asserting kvs array
    const kvs = await consumerLogicA["kvs()"]();

    assert(kvs.length == 2, "Invalid kvs length");
    assert(kvs[0].eq(key), "Invalid Key set in kv");
    assert(kvs[1].eq(val), "Invalid Value set in kv");
  });

  it("should share set/get values across all expressions from the calling contract if namespace is not set", async () => {
    const key1 = 111111;
    const val1 = randomUint256();
    const key2 = 222222;
    const val2 = randomUint256();

    const { sources: sourcesA, constants: constantsA } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
        : set(${key1} ${val1}) set(${key2} ${val2});`
      );

    const expressionA = await expressionConsumerDeploy(
      sourcesA,
      constantsA,
      rainInterpreter,
      0
    );

    const interpreterStore: RainterpreterStore =
      await rainterpreterStoreDeploy();

    await consumerLogicA["eval(address,address,uint256,uint256[][])"](
      rainInterpreter.address,
      interpreterStore.address,
      expressionA.dispatch,
      []
    );

    // Saving state changes in interpreter storage
    const kvs_ = await consumerLogicA["kvs()"]();
    await consumerLogicA["set(address,uint256[])"](
      await consumerLogicA.store(),
      kvs_
    );

    // Asserting StateChanges array
    const kvs = await consumerLogicA["kvs()"]();

    assert(kvs.length == 4, `Invalid kvs length`);
    assert(kvs[0].eq(key1), `Invalid Key 2 set in kv ${kvs[0]} ${key1}`);
    assert(kvs[1].eq(val1), `Invalid Value 2 set in kv ${kvs[1]} ${val1}`);
    assert(kvs[2].eq(key2), `Invalid Key 1 set in kv ${kvs[2]} ${key2}`);
    assert(kvs[3].eq(val2), `Invalid Value 1 set in kv ${kvs[3]} ${val2}`);

    const { sources: sourcesB, constants: constantsB } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
        _ _: get(${key1}) get(${key2});`
      );

    const expressionB = await expressionConsumerDeploy(
      sourcesB,
      constantsB,
      rainInterpreter,
      2
    );

    await consumerLogicA["eval(address,address,uint256,uint256[][])"](
      rainInterpreter.address,
      interpreterStore.address,
      expressionB.dispatch,
      []
    );

    //Asserting stack
    const stack = await consumerLogicA.stack();

    assert(stack.length == 2, "Invalid stack length");
    assert(stack[0].eq(val1), "Invalid value was SET / GET for key 1");
    assert(stack[1].eq(val2), "Invalid value was SET / GET for key 2");
  });

  it("should not share set/get values across expressions for different calling contract if namespace is not set", async () => {
    const key = 111111;
    const val = randomUint256();

    const { sources: sourcesA, constants: constantsA } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
key: ${key},
        val: ${val},
        : set(key val);`
      );

    const expressionA = await expressionConsumerDeploy(
      sourcesA,
      constantsA,
      rainInterpreter,
      0
    );

    const interpreterStore: RainterpreterStore =
      await rainterpreterStoreDeploy();

    await consumerLogicA["eval(address,address,uint256,uint256[][])"](
      rainInterpreter.address,
      interpreterStore.address,
      expressionA.dispatch,
      []
    );

    const kvs_ = await consumerLogicA["kvs()"]();
    await consumerLogicA["set(address,uint256[])"](
      consumerLogicA.store(),
      kvs_
    );

    // Asserting StateChanges array
    const kvs = await consumerLogicA["kvs()"]();

    assert(kvs.length == 2, "Invalid kvs length");
    assert(kvs[0].eq(key), "Invalid Key set in kv");
    assert(kvs[1].eq(val), "Invalid Value set in kv");

    const { sources: sourcesB, constants: constantsB } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
key: ${key},
        _: get(key);`
      );

    const expressionB = await expressionConsumerDeploy(
      sourcesB,
      constantsB,
      rainInterpreter,
      1
    );

    await consumerLogicB["eval(address,address,uint256,uint256[][])"](
      rainInterpreter.address,
      interpreterStore.address,
      expressionB.dispatch,
      []
    );

    //Asserting stack
    const stack = await consumerLogicB.stack();

    assert(stack.length == 1, "Invalid stack length");
    assert(stack[0].eq(0), "Invalid value was SET / GET for key");
  });

  it("should test that if namespace is set then set/get can only interact with other set/get in the same namespace as set by calling contract", async () => {
    const key = 111111;
    const val = randomUint256();
    const namespaceA = 999999;
    const namespaceB = 666666;

    const { sources: sourcesA, constants: constantsA } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
key: ${key},
        val: ${val},
        : set(key val);`
      );

    const expressionA = await expressionConsumerDeploy(
      sourcesA,
      constantsA,
      rainInterpreter,
      0
    );

    const interpreterStore: RainterpreterStore =
      await rainterpreterStoreDeploy();

    await consumerLogicA.evalWithNamespace(
      rainInterpreter.address,
      interpreterStore.address,
      namespaceA,
      expressionA.dispatch,
      []
    );

    // Saving interpreter state
    const kvs_ = await consumerLogicA["kvs()"]();
    await consumerLogicA["set(address,uint256,uint256[])"](
      await consumerLogicA.store(),
      namespaceA,
      kvs_
    );

    // Asserting kvs array
    const kvs = await consumerLogicA["kvs()"]();

    assert(kvs.length == 2, "Invalid kvs length");
    assert(kvs[0].eq(key), "Invalid Key set in kv");
    assert(kvs[1].eq(val), "Invalid Value set in kv");

    // B evals on different namespace
    const { sources: sourcesB, constants: constantsB } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
key: ${key},
        _: get(key);`
      );

    const expressionB = await expressionConsumerDeploy(
      sourcesB,
      constantsB,
      rainInterpreter,
      1
    );

    await consumerLogicA.evalWithNamespace(
      rainInterpreter.address,
      interpreterStore.address,
      namespaceB,
      expressionB.dispatch,
      []
    );

    //Asserting stack
    const stackB = await consumerLogicA.stack();

    assert(stackB.length == 1, "Invalid stack length");
    assert(stackB[0].eq(0), "Invalid value was SET / GET for key 1");

    // C evals on correct namespace
    const { sources: sourcesC, constants: constantsC } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
key: ${key},
        _: get(key);`
      );

    const expressionC = await expressionConsumerDeploy(
      sourcesC,
      constantsC,
      rainInterpreter,
      1
    );

    await consumerLogicA.evalWithNamespace(
      rainInterpreter.address,
      interpreterStore.address,
      namespaceA,
      expressionC.dispatch,
      []
    );

    //Asserting stack
    const stackA = await consumerLogicA.stack();

    assert(stackA.length == 1, "Invalid stack length");
    assert(stackA[0].eq(val), "Invalid value was SET / GET for key 1");
  });

  it("should ensure that calling set doesn't overwrite keys in the same namespace from a different calling contract", async () => {
    const key = 111111;
    const val1 = randomUint256();
    const val2 = randomUint256();
    const namespaceA = 999999;

    const { sources: sourcesA, constants: constantsA } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
key: ${key},
        val: ${val1},
        : set(key val);`
      );

    const expressionA = await expressionConsumerDeploy(
      sourcesA,
      constantsA,
      rainInterpreter,
      0
    );

    const interpreterStore: RainterpreterStore =
      await rainterpreterStoreDeploy();

    await consumerLogicA.evalWithNamespace(
      rainInterpreter.address,
      interpreterStore.address,
      namespaceA,
      expressionA.dispatch,
      []
    );

    const _KVsA = await consumerLogicA["kvs()"]();
    await consumerLogicA["set(address,uint256,uint256[])"](
      await consumerLogicA.store(),
      namespaceA,
      _KVsA
    );

    const { sources: sourcesB, constants: constantsB } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
key: ${key},
        val: ${val2},
        : set(key val);`
      );

    const expressionB = await expressionConsumerDeploy(
      sourcesB,
      constantsB,
      rainInterpreter,
      0
    );

    await consumerLogicB.evalWithNamespace(
      rainInterpreter.address,
      interpreterStore.address,
      namespaceA,
      expressionB.dispatch,
      []
    );

    const _KVsB = await consumerLogicB["kvs()"]();
    await consumerLogicB["set(address,uint256,uint256[])"](
      consumerLogicB.store(),
      namespaceA,
      _KVsB
    );

    // Asserting KVs array
    const KVsA = await consumerLogicA["kvs()"]();
    const KVsB = await consumerLogicB["kvs()"]();

    assert(KVsA.length == 2, "Invalid KVsA length");
    assert(KVsA[0].eq(key), "Invalid Key set in KVsA");
    assert(KVsA[1].eq(val1), "Invalid Value set in KVsA");

    assert(KVsB.length == 2, "Invalid KVsB length");
    assert(KVsB[0].eq(key), "Invalid Key set in KVsB");
    assert(KVsB[1].eq(val2), "Invalid Value set in KVsB");
  });

  it("ensure that calling get on an unset key falls back to 0", async () => {
    const key1 = 111111;
    const val1 = 123;
    const key2 = 222222;

    const { sources: sourcesA, constants: constantsA } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
key: ${key1},
        val: ${val1},
        : set(key val);`
      );

    const expressionA = await expressionConsumerDeploy(
      sourcesA,
      constantsA,
      rainInterpreter,
      0
    );

    const interpreterStore: RainterpreterStore =
      await rainterpreterStoreDeploy();

    await consumerLogicA["eval(address,address,uint256,uint256[][])"](
      rainInterpreter.address,
      interpreterStore.address,
      expressionA.dispatch,
      []
    );

    const _KVsA = await consumerLogicA["kvs()"]();
    await consumerLogicA["set(address,uint256[])"](
      await consumerLogicA.store(),
      _KVsA
    );
    const { sources: sourcesB, constants: constantsB } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
key: ${key2},
        _: get(key);`
      );

    const expressionB = await expressionConsumerDeploy(
      sourcesB,
      constantsB,
      rainInterpreter,
      1
    );

    await consumerLogicA["eval(address,address,uint256,uint256[][])"](
      rainInterpreter.address,
      interpreterStore.address,
      expressionB.dispatch,
      []
    );

    //Asserting stack
    const stack = await consumerLogicA.stack();
    assert(stack.length == 1, "Invalid stack length");
    assert(stack[0].eq(0), "Invalid value was SET / GET for key");
  });

  it("ensure that calling get returns the latest set value with priority over previous calls to set", async () => {
    const key = 111;
    const val1 = 456;
    const val2 = 789;
    const val3 = 123;

    const { sources: sourcesA, constants: constantsA } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
key: ${key},
        val1: ${val1},
        val2: ${val2},
        : set(key val1) set(key val2);`
      );

    const expressionA = await expressionConsumerDeploy(
      sourcesA,
      constantsA,
      rainInterpreter,
      0
    );

    const interpreterStore: RainterpreterStore =
      await rainterpreterStoreDeploy();

    await consumerLogicA["eval(address,address,uint256,uint256[][])"](
      rainInterpreter.address,
      interpreterStore.address,
      expressionA.dispatch,
      []
    );

    const _KVsA = await consumerLogicA["kvs()"]();
    // Assert State Change
    assert(_KVsA.length == 2, "Invalid kvs length");
    assert(_KVsA[0].eq(key), "Invalid Key set in kvs");
    assert(_KVsA[1].eq(val2), "Invalid Value set in kvs");

    await consumerLogicA["set(address,uint256[])"](
      await consumerLogicA.store(),
      _KVsA
    );

    const { sources: sourcesB, constants: constantsB } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
key: ${key},
        val: ${val3},
        : set(key val);`
      );

    const expressionB = await expressionConsumerDeploy(
      sourcesB,
      constantsB,
      rainInterpreter,
      0
    );

    await consumerLogicA["eval(address,address,uint256,uint256[][])"](
      rainInterpreter.address,
      interpreterStore.address,
      expressionB.dispatch,
      []
    );

    const _KVsB = await consumerLogicA["kvs()"]();

    //assert state change
    assert(_KVsB.length == 2, "Invalid kvs length");
    assert(_KVsB[0].eq(key), "Invalid Key set in kv");
    assert(_KVsB[1].eq(val3), "Invalid Value set in kv");

    await consumerLogicA["set(address,uint256[])"](
      await consumerLogicA.store(),
      _KVsB
    );

    const { sources: sourcesC, constants: constantsC } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
key: ${key},
        _: get(key);`
      );

    const expressionC = await expressionConsumerDeploy(
      sourcesC,
      constantsC,
      rainInterpreter,
      1
    );

    await consumerLogicA["eval(address,address,uint256,uint256[][])"](
      rainInterpreter.address,
      interpreterStore.address,
      expressionC.dispatch,
      []
    );

    //Asserting stack
    const stack = await consumerLogicA.stack();
    assert(stack.length == 1, "Invalid stack length");
    assert(stack[0].eq(val3), "Invalid value was SET / GET for key");
  });
});
