import { ethers } from "hardhat";
import { IInterpreterV1Consumer } from "../../typechain";
import { assertError, standardEvaluableConfig } from "../../utils";
import deploy1820 from "../../utils/deploy/registry1820/deploy";

describe("Rainlang inputs special case", async () => {
  let logic: IInterpreterV1Consumer;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    const consumerFactory = await ethers.getContractFactory(
      "IInterpreterV1Consumer"
    );
    logic = (await consumerFactory.deploy()) as IInterpreterV1Consumer;
    await logic.deployed();
  });

  it("should error if inputs operand arg is explicitly specified, since inputs operand arg is a special case and is always inferred from number of input parameters", async () => {
    await assertError(
      async () => standardEvaluableConfig(`_: add<5>(1 2 3);`),
      "", // any error
      `Rainlang parser did not error when "inputs" operand arg was specified`
    );
  });
});
