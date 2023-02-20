import { assert } from "chai";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import { max_uint256, standardEvaluableConfig } from "../../../../utils";

import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";

describe.only("Encode Op Tests", async function () {
  let rainInterpreter: Rainterpreter;
  let logic: IInterpreterV1Consumer;
;

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

  it("Encode Op Test", async () => {

    const source = '0x000000000000000000000000000000000000000000000000000000000000000a'
    const target = '0x000000000000000000000000000000000000000000000000000000000000000f'
    const expect = '0x0000000000000000000000000000000000000000000000000000000000000a0f'

    const { sources: sources0, constants: constants0 } = standardEvaluableConfig(
      `_: encode-256<8 4>(${source} ${target});`
    );

    console.log(sources0)

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

    const result0 = await logic.stackTop()
    console.log("result0 : " , result0.toHexString() )


    const { sources: sources1, constants: constants1 } = standardEvaluableConfig(
        `_: decode-256<8 255>(${target});`
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

    const result1 = await logic.stackTop()
    console.log("result1 : " , result1 )



  });

});
