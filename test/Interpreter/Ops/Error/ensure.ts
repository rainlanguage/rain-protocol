import { assert } from "chai";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import { assertError, standardEvaluableConfig } from "../../../../utils";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { rainlang } from "../../../../utils/extensions/rainlang";

describe("ENSURE Opcode test", async function () {
  let rainInterpreter: Rainterpreter;
  let logic: IInterpreterV1Consumer;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    rainInterpreter = await rainterpreterDeploy();
    rainInterpreter = await rainterpreterDeploy();

    const consumerFactory = await ethers.getContractFactory(
      "IInterpreterV1Consumer"
    );
    logic = (await consumerFactory.deploy()) as IInterpreterV1Consumer;
    await logic.deployed();
  });

  it("should execute the transaction if it passes the ensure opcode condition", async () => {
    const { sources: sources0, constants: constants0 } =
      await standardEvaluableConfig(rainlang`_: ensure(eager-if(1 2 3)) 1;`);

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

    assert(result0.eq(1), `returned wrong value from eager if, got ${result0}`);

    const { sources: sources1, constants: constants1 } =
      await standardEvaluableConfig(rainlang`_: ensure(eager-if(2 2 3)) 3;`);

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

    assert(result1.eq(3), `returned wrong value from eager if, got ${result1}`);

    const { sources: sources2, constants: constants2 } =
      await standardEvaluableConfig(rainlang`_: ensure(eager-if(0 2 3)) 0;`);

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

    assert(result2.eq(0), `returned wrong value from eager if, got ${result2}`);
  });

  it("should revert the transaction if it fails ensure opcode condition", async () => {
    const { sources: sources0, constants: constants0 } =
      await standardEvaluableConfig(rainlang`_: ensure(eager-if(0 2 0)) 1;`);

    const expression0 = await expressionConsumerDeploy(
      sources0,
      constants0,
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
      "",
      "did not revert even after failing the ensure opcode condition"
    );

    const { sources: sources1, constants: constants1 } =
      await standardEvaluableConfig(rainlang`_: ensure(eager-if(2 0 3)) 3;`);

    const expression1 = await expressionConsumerDeploy(
      sources1,
      constants1,
      rainInterpreter,
      1
    );

    await assertError(
      async () =>
        await logic["eval(address,uint256,uint256[][])"](
          rainInterpreter.address,
          expression1.dispatch,
          []
        ),
      "",
      "did not revert even after failing the ensure opcode condition"
    );

    const { sources: sources2, constants: constants2 } =
      await standardEvaluableConfig(rainlang`_: ensure(eager-if(0 2 0)) 0;`);

    const expression2 = await expressionConsumerDeploy(
      sources2,
      constants2,
      rainInterpreter,
      1
    );

    await assertError(
      async () =>
        await logic["eval(address,uint256,uint256[][])"](
          rainInterpreter.address,
          expression2.dispatch,
          []
        ),
      "",
      "did not revert even after failing the ensure opcode condition"
    );
  });
});
