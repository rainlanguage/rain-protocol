import { strict as assert } from "assert";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import {
  assertError,
  opMetaHash,
  standardEvaluableConfig,
} from "../../../../utils";

import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { rainlang } from "../../../../utils/extensions/rainlang";

describe("Encode Op Tests", async function () {
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

  it("should encode with bit mask of length 4", async () => {
    const source =
      "0x000000000000000000000000000000000000000000000000000000000000ffff";
    const target =
      "0x000000000000000000000000000000000000000000000000000000000000cccc";
    const expected =
      "0x0000000000000000000000000000000000000000000000000000000ffffcccc";

    const { sources: sources0, constants: constants0 } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
_: encode-256<16 16>(${source} ${target});`
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

    assert(
      ethers.utils.hexStripZeros(result0.toHexString()) ===
        ethers.utils.hexStripZeros(expected),
      "Incorrect Encoding"
    );
  });

  it("should encode with bit mask of length 32 ", async () => {
    const source =
      "0x00000000000000000000000000000000cccccccccccccccccccccccccccccccc";
    const target =
      "0x00000000000000000000000000000000ffffffffffffffffffffffffffffffff";
    const expected =
      "0xccccccccccccccccccccccccccccccccffffffffffffffffffffffffffffffff";

    const { sources: sources0, constants: constants0 } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
_: encode-256<128 128>(${source} ${target});`
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
    assert(
      ethers.utils.hexStripZeros(result0.toHexString()) ===
        ethers.utils.hexStripZeros(expected),
      "Incorrect Encoding"
    );
  });

  it("should fail if (startBit + length) exceeds 256 bits", async () => {
    const source =
      "0x0000000000000000000000000000000ccccccccccccccccccccccccccccccccc";
    const target =
      "0x00000000000000000000000000000000ffffffffffffffffffffffffffffffff";

    // startBit + length exceeds 256 bits
    const { sources: sources0, constants: constants0 } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
_: encode-256<128 129>(${source} ${target});`
      );

    await assertError(
      async () =>
        await expressionConsumerDeploy(
          sources0,
          constants0,
          rainInterpreter,
          1
        ),
      "TruncatedEncoding",
      "Incorrect encoded bits"
    );
  });

  it("should encode non-zero spaces overwriting the bytes", async () => {
    // variation 0
    const source0 =
      "0x000000000000000000000000000000000000000000000000000000000000ffff";
    const target0 =
      "0x000000000000000000000000000000000000000000000000000000000000cccc";
    const expected0 =
      "0x00000000000000000000000000000000000000000000000000000000ffffccc";

    const { sources: sources0, constants: constants0 } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
_: encode-256<12 16>(${source0} ${target0});`
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

    assert(
      ethers.utils.hexStripZeros(result0.toHexString()) ===
        ethers.utils.hexStripZeros(expected0),
      "Incorrect Encoding"
    );

    // variation 1
    const source1 =
      "0x000000000000000000000000000000000000000000000000000000aaaa00ffff";
    const target1 =
      "0x000000000000000000000000000000000000000000000000000044440000cccc";
    const expected1 =
      "0x000000000000000000000000000000000000000000000000000044aa00ffffcc";

    const { sources: sources1, constants: constants1 } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
_: encode-256<8 32>(${source1} ${target1});`
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
    assert(
      ethers.utils.hexStripZeros(result1.toHexString()) ===
        ethers.utils.hexStripZeros(expected1),
      "Incorrect Encoding"
    );

    // variation 2
    const source2 =
      "0x000000000000000000000000000000000ffaaccbbdd00000000000aaaa00ffff";
    const target2 =
      "0xffffffffff00000000000000000000000000000000000000000044440000cccc";
    const expected2 =
      "0xffffffffff00000000000000000000000ffaaccbbdd00000000000aaaa00ffff";

    const { sources: sources2, constants: constants2 } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
_: encode-256<0 124>(${source2} ${target2});`
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
    assert(
      ethers.utils.hexStripZeros(result2.toHexString()) ===
        ethers.utils.hexStripZeros(expected2),
      "Incorrect Encoding"
    );

    // variation 3
    const source3 =
      "0xeeeeeeeeee000000000000000000000000000000000000000000000000000000";
    const target3 =
      "0x000000000000000000000000000000000000000000000000000000aaaa00ffff";
    const expected3 =
      "0xee000000000000000000000000000000000000000000000000000000aa00ffff";

    const { sources: sources3, constants: constants3 } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
_: encode-256<32 224>(${source3} ${target3});`
      );

    const expression3 = await expressionConsumerDeploy(
      sources3,
      constants3,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression3.dispatch,
      []
    );

    const result3 = await logic.stackTop();
    assert(
      ethers.utils.hexStripZeros(result3.toHexString()) ===
        ethers.utils.hexStripZeros(expected3),
      "Incorrect Encoding"
    );

    // variation 4
    const source4 =
      "0xeeeeeeeeee00000000000000000eeeeeeeeee00000000000000000eeeeeeeeee";
    const target4 =
      "0x00000aaaaaaaaa000000aaaaaaaaaaa0000aaaaaaa000000000000aaaaaaaaaa";
    const expected4 =
      "0x00000aaaaaaaaa000000aaaaeeeee00000000000000000eeeeeeeeeeaaaaaaaa";
    const { sources: sources4, constants: constants4 } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
_: encode-256<32 128>(${source4} ${target4});`
      );

    const expression4 = await expressionConsumerDeploy(
      sources4,
      constants4,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression4.dispatch,
      []
    );

    const result4 = await logic.stackTop();
    assert(
      ethers.utils.hexStripZeros(result4.toHexString()) ===
        ethers.utils.hexStripZeros(expected4),
      "Incorrect Encoding"
    );

    // variation 5
    const source5 =
      "0xeeeeeeeeee00000000000000000eeeeeeeeee00000000000000000eeeeeeeeee";
    const target5 =
      "0x00000aaaaaaaaa000000aaaaaaaaaaa0000aaaaaaa000000000000aaaaaaaaaa";
    const expected5 =
      "0xee000aaaaaaaaa000000aaaaaaaaaaa0000aaaaaaa000000000000aaaaaaaaaa";

    const { sources: sources5, constants: constants5 } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
_: encode-256<248 8>(${source5} ${target5});`
      );

    const expression5 = await expressionConsumerDeploy(
      sources5,
      constants5,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression5.dispatch,
      []
    );

    const result5 = await logic.stackTop();
    assert(
      ethers.utils.hexStripZeros(result5.toHexString()) ===
        ethers.utils.hexStripZeros(expected5),
      "Incorrect Encoding"
    );
  });
});
