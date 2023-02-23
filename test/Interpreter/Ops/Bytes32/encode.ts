import { assert } from "chai";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import { assertError, standardEvaluableConfig } from "../../../../utils";

import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";

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
        `_: encode-256<16 16>(${source} ${target});`
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
        `_: encode-256<128 128>(${source} ${target});`
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
  });

  it("should fail if (startBit + length) exceeds 256 bits", async () => {
    const source =
      "0x0000000000000000000000000000000ccccccccccccccccccccccccccccccccc";
    const target =
      "0x00000000000000000000000000000000ffffffffffffffffffffffffffffffff";

    // startBit + length exceeds 256 bits
    const { sources: sources0, constants: constants0 } =
      await standardEvaluableConfig(
        `_: encode-256<128 129>(${source} ${target});`
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
});
