import { FakeContract, smock } from "@defi-wonderland/smock";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { RainterpreterStore } from "../../../../typechain";
import { Rainterpreter } from "../../../../typechain/contracts/interpreter/shared/Rainterpreter";

import {
  AllStandardOps,
  assertError,
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils";
import {
  rainterpreterDeploy,
  rainterpreterStoreDeploy,
} from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployerDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";

describe("RainterpreterExpressionDeployer integrityCheck tests", async function () {
  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);
  });
  it("should revert if interpreter bytecode is undefined", async () => {
    const fakeInterpreter: FakeContract<Rainterpreter> = await smock.fake(
      "Rainterpreter"
    ); // should not contain same bytecode as real contract
    fakeInterpreter.functionPointers.returns(0);
    const fakeStore: FakeContract<RainterpreterStore> = await smock.fake(
      "RainterpreterStore"
    );

    await assertError(
      async () =>
        await rainterpreterExpressionDeployerDeploy(
          fakeInterpreter as unknown as Rainterpreter,
          fakeStore as unknown as RainterpreterStore
        ),
      'UnexpectedPointers(\\"0x00\\")',
      "did not revert when bytecode hash was unexpected"
    );
  });

  it("should revert if interpreter bytecode is unexpected", async () => {
    const fakeInterpreter: FakeContract<Rainterpreter> = await smock.fake(
      "Rainterpreter"
    ); // should not contain same bytecode as real contract
    const fakeStore: FakeContract<RainterpreterStore> = await smock.fake(
      "RainterpreterStore"
    );

    fakeInterpreter.functionPointers.returns(
      "0x081d082b088008d408f6094e098509a309b209c109cf09dd09eb09c109f90a070a150a240a330a410a4f0a5d0a6b0aee0afd0b0c0b1b0b2a0b390b820b940ba20bd40be20bf00bfe0c0d0c1c0c2b0c3a0c490c580c670c760c850c940ca30cb10cbf0ccd0cdb0ce90cf80d070d150d7f" // maintaining this test is a nightmare
    );

    await assertError(
      async () =>
        await rainterpreterExpressionDeployerDeploy(
          fakeInterpreter as unknown as Rainterpreter,
          fakeStore as unknown as RainterpreterStore
        ),
      "UnexpectedPointers",
      "did not revert when bytecode hash was unexpected"
    );
  });


  it("should not revert if interpreter bytecode and function pointers are as expected", async () => {
    const interpreter = await rainterpreterDeploy();
    const store = await rainterpreterStoreDeploy();
    const expressionDeployer = await rainterpreterExpressionDeployerDeploy(
      interpreter,
      store
    );

    const config = {
      constants: ["1", "2"],
      sources: [
        concat([
          op(AllStandardOps.readMemory, memoryOperand(MemoryType.Constant, 0)),
          op(AllStandardOps.readMemory, memoryOperand(MemoryType.Constant, 1)),
          op(AllStandardOps.add, 2),
        ]),
      ],
    };

    await assertError(
      async () =>
        await expressionDeployer.deployExpression(
          config.sources,
          config.constants,
          [1, 1]
        ), // Adding an extra minStackOutput element
      "MissingEntrypoint(2, 1)",
      "Entrypoint check failed"
    );
  });
});
