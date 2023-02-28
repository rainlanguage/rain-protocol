import { concat } from "ethers/lib/utils";
import { Rainterpreter } from "../../../../typechain/contracts/interpreter/shared/Rainterpreter";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { op } from "../../../../utils/interpreter/interpreter";
import { assertError } from "../../../../utils/test/assertError";

describe("Rainterpreter opcode test", async function () {
  let rainInterpreter: Rainterpreter;

  before(async () => {
    rainInterpreter = await rainterpreterDeploy();
  });

  it("should error when script references out-of-bounds opcode", async () => {
    const constants = [];

    const sources = [concat([op(999)])];

    await assertError(
      async () =>
        await expressionConsumerDeploy(sources, constants, rainInterpreter, 0),
      "Error",
      "did not error when script references out-of-bounds opcode"
    );
  });
});
