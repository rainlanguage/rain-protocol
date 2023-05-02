import { strict as assert } from "assert";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import { standardEvaluableConfig } from "../../../../utils";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { rainlang } from "../../../../utils/extensions/rainlang";

describe("EXPLODE32 Opcode test", async function () {
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

  it("should explode a single value into 8x 32 bit integers", async () => {
    const { sources, constants } = await standardEvaluableConfig(
      rainlang`value: context<0 0>(), /* initial value */
      _ _ _ _ _ _ _ _: explode-32(value);`
    );

    const expression0 = await expressionConsumerDeploy(
      sources,
      constants,
      rainInterpreter,
      8
    );
    // 0
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      [
        [
          ethers.BigNumber.from(
            "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
          ),
        ],
      ]
    );
    const result0 = await logic.stack();
    const expectedResult0 = [
      ethers.BigNumber.from("0xffffffff"),
      ethers.BigNumber.from("0xffffffff"),
      ethers.BigNumber.from("0xffffffff"),
      ethers.BigNumber.from("0xffffffff"),
      ethers.BigNumber.from("0xffffffff"),
      ethers.BigNumber.from("0xffffffff"),
      ethers.BigNumber.from("0xffffffff"),
      ethers.BigNumber.from("0xffffffff"),
    ];
    assert.deepEqual(
      result0,
      expectedResult0,
      `Invalid output, expected ${expectedResult0}, actual ${result0}`
    );

    // 1
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      [
        [
          ethers.BigNumber.from(
            "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
          ),
        ],
      ]
    );
    const result1 = await logic.stack();
    const expectedResult1 = [
      ethers.BigNumber.from("0xffffffff"),
      ethers.BigNumber.from("0xffffffff"),
      ethers.BigNumber.from("0xffffffff"),
      ethers.BigNumber.from("0xffffffff"),
      ethers.BigNumber.from("0xffffffff"),
      ethers.BigNumber.from("0xffffffff"),
      ethers.BigNumber.from("0xffffffff"),
      ethers.BigNumber.from("0"),
    ];
    assert.deepEqual(
      result1,
      expectedResult1,
      `Invalid output, expected ${expectedResult1}, actual ${result1}`
    );

    // 2
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      [[ethers.BigNumber.from("0x0")]]
    );
    const result2 = await logic.stack();
    const expectedResult2 = [
      ethers.BigNumber.from("0"),
      ethers.BigNumber.from("0"),
      ethers.BigNumber.from("0"),
      ethers.BigNumber.from("0"),
      ethers.BigNumber.from("0"),
      ethers.BigNumber.from("0"),
      ethers.BigNumber.from("0"),
      ethers.BigNumber.from("0"),
    ];
    assert.deepEqual(
      result2,
      expectedResult2,
      `Invalid output, expected ${expectedResult2}, actual ${result2}`
    );
  });
});
