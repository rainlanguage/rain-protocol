import { FakeContract, smock } from "@defi-wonderland/smock";
import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { Rainterpreter } from "../../../../typechain/contracts/interpreter/shared/Rainterpreter";
import { ValidInterpreterEvent } from "../../../../typechain/contracts/interpreter/shared/RainterpreterExpressionDeployer";
import { AllStandardOps, assertError, getEventArgs, memoryOperand, MemoryType, op } from "../../../../utils";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployerDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";

describe("RainterpreterExpressionDeployer integrityCheck tests", async function () {
  it("should revert if interpreter bytecode is undefined", async () => {
    const fakeInterpreter: FakeContract<Rainterpreter> = await smock.fake(
      "Rainterpreter"
    ); // should not contain same bytecode as real contract
    fakeInterpreter.functionPointers.returns(0);

    await assertError(
      async () =>
        await rainterpreterExpressionDeployerDeploy(
          fakeInterpreter as unknown as Rainterpreter
        ),
      'UnexpectedPointers(\\"0x00\\")',
      "did not revert when bytecode hash was unexpected"
    );
  });

  it("should revert if interpreter bytecode is unexpected", async () => {
    const fakeInterpreter: FakeContract<Rainterpreter> = await smock.fake(
      "Rainterpreter"
    ); // should not contain same bytecode as real contract
    fakeInterpreter.functionPointers.returns(
      "0x081d082b088008d408f6094e098509a309b209c109cf09dd09eb09c109f90a070a150a240a330a410a4f0a5d0a6b0aee0afd0b0c0b1b0b2a0b390b820b940ba20bd40be20bf00bfe0c0d0c1c0c2b0c3a0c490c580c670c760c850c940ca30cb10cbf0ccd0cdb0ce90cf80d070d150d7f" // maintaining this test is a nightmare
    );

    await assertError(
      async () =>
        await rainterpreterExpressionDeployerDeploy(
          fakeInterpreter as unknown as Rainterpreter
        ),
      "UnexpectedPointers",
      "did not revert when bytecode hash was unexpected"
    );
  });

  it("should not revert if interpreter bytecode and function pointers are as expected", async () => {
    const signers = await ethers.getSigners();

    const rainterpreter = await rainterpreterDeploy();

    const expressionDeployer = await rainterpreterExpressionDeployerDeploy(
      rainterpreter
    );

    const { sender, interpreter } = (await getEventArgs(
      expressionDeployer.deployTransaction,
      "ValidInterpreter",
      expressionDeployer
    )) as ValidInterpreterEvent["args"];

    assert(sender === signers[0].address);
    assert(interpreter === rainterpreter.address);
  });
  
  it("should not revert if interpreter bytecode and function pointers are as expected", async () => {
    const interpreter = await rainterpreterDeploy();
    const expressionDeployer = await rainterpreterExpressionDeployerDeploy(
      interpreter
    );

    const config = {
      constants: ["1", "2"],
      sources: [
        concat([
          op(AllStandardOps.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
          op(AllStandardOps.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
          op(AllStandardOps.ADD, 2),
        ]),
      ],
    };

    assertError(
      async () => await expressionDeployer.deployExpression(config, [1, 1]),  // Adding an extra minStackOutput element
      "MissingEntrypoint(2, 1)",
      "Entrypoint check failed"
    );
  });
});
