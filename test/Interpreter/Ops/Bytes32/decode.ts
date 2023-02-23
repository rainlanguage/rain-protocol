import { assert } from "chai";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import { assertError, standardEvaluableConfig } from "../../../../utils";

import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";

describe("Decode Op Tests", async function () {
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

  it("should decode correctly for given bit mask", async () => {
    const source =
      "0x000000000000000000000000000000000000000000000000000000000000ffff";
    const expected =
      "0xffff00000000000000000000000000000000000000000000000000000000cccc";

    const { sources: sources0, constants: constants0 } =
      await standardEvaluableConfig(`_: decode-256<240 16>(${expected});`);

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
      ethers.utils.hexStripZeros(result0.toHexString()) ==
        ethers.utils.hexStripZeros(source),
      "Incorrectly decoded target"
    );
  });

  it("should encode with bit mask of length 32 ", async () => {
    const source =
      "0x00000000000000000000000000000000cccccccccccccccccccccccccccccccc";
    const expected =
      "0xccccccccccccccccccccccccccccccccffffffffffffffffffffffffffffffff";

    const { sources: sources0, constants: constants0 } =
      await standardEvaluableConfig(`_: decode-256<128 128>(${expected});`);

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
      ethers.utils.hexStripZeros(result0.toHexString()) ==
        ethers.utils.hexStripZeros(source),
      "Incorrectly decoded target"
    );
  });

  it("should fail if (startBit + length) exceeds 256 bits", async () => {
    const expected =
      "0xcccccccccccccccccccccccccccccccccfffffffffffffffffffffffffffffff";

    // startBit + length exceeds 256 bits
    const { sources: sources0, constants: constants0 } =
      await standardEvaluableConfig(`_: decode-256<128 129>(${expected});`);

    await assertError(
      async () =>
        await expressionConsumerDeploy(
          sources0,
          constants0,
          rainInterpreter,
          1
        ),
      "TruncatedEncoding",
      "Incorrect decoded bits"
    );
  });

  it("should encode-decode for a round trip", async () => {
    const source =
      "0x0000000000000000000000000000000000000000cccccccc00000000dddddddd";
    const target =
      "0xaaaaaaaa00000000bbbbbbbb0000000000000000000000000000000000000000";
    const expected =
      "0xaaaaaaaa00000000bbbbbbbb0000000000000000cccccccc00000000dddddddd";

    // startBit + length exceeds 256 bits
    const { sources: sources0, constants: constants0 } =
      await standardEvaluableConfig(
        `_: encode-256<0 96>(${source} ${target});`
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
      ethers.utils.hexStripZeros(result0.toHexString()) ==
        ethers.utils.hexStripZeros(expected),
      "Incorrect Encoding"
    );

    const { sources: sources1, constants: constants1 } =
      await standardEvaluableConfig(`_: decode-256<0 96>(${expected});`);

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
      ethers.utils.hexStripZeros(result1.toHexString()) ==
        ethers.utils.hexStripZeros(source),
      "Incorrectly decoded target"
    );
  });
});
