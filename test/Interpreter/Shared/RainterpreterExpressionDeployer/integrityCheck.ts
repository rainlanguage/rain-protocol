import { FakeContract, smock } from "@defi-wonderland/smock";
import { assert } from "chai";
import { ethers } from "hardhat";
import { Rainterpreter } from "../../../../typechain/contracts/interpreter/shared/Rainterpreter";
import { ValidInterpreterEvent } from "../../../../typechain/contracts/interpreter/shared/RainterpreterExpressionDeployer";
import { assertError, getEventArgs } from "../../../../utils";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployer } from "../../../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";

describe("RainterpreterExpressionDeployer integrityCheck tests", async function () {
  it("should revert if interpreter bytecode is unexpected", async () => {
    const fakeInterpreter: FakeContract<Rainterpreter> = await smock.fake(
      "Rainterpreter"
    ); // should not contain same bytecode as real contract
    fakeInterpreter.functionPointers.returns(0);

    await assertError(
      async () =>
        await rainterpreterExpressionDeployer(
          fakeInterpreter as unknown as Rainterpreter
        ),
      "BAD_POINTERS",
      "did not revert when bytecode hash was unexpected"
    );
  });

  it("should revert if interpreter bytecode is unexpected", async () => {
    const fakeInterpreter: FakeContract<Rainterpreter> = await smock.fake(
      "Rainterpreter"
    ); // should not contain same bytecode as real contract
    fakeInterpreter.functionPointers.returns(
      "0x081d082b088008d408f6094e098509a309b209c109cf09dd09eb09c109f90a070a150a240a330a410a4f0a5d0a6b0aee0afd0b0c0b1b0b2a0b390b820b940ba20bd40be20bf00bfe0c0d0c1c0c2b0c3a0c490c580c670c760c850c940ca30cb10cbf0ccd0cdb0ce90cf80d070d150d7f"
    );

    await assertError(
      async () =>
        await rainterpreterExpressionDeployer(
          fakeInterpreter as unknown as Rainterpreter
        ),
      "BAD_INTERPRETER_HASH",
      "did not revert when bytecode hash was unexpected"
    );
  });

  it("should not revert if interpreter bytecode and function pointers are as expected", async () => {
    const signers = await ethers.getSigners();

    const rainterpreter = await rainterpreterDeploy();

    const expressionDeployer = await rainterpreterExpressionDeployer(
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
});
