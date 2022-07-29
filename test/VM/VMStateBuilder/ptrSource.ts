import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { AllStandardOpsIntegrity } from "../../../typechain/AllStandardOpsIntegrity";
import { AllStandardOpsTest } from "../../../typechain/AllStandardOpsTest";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { bytify } from "../../../utils/rainvm/vm";
import { assertError } from "../../../utils/test/assertError";

const Opcode = AllStandardOps;

describe("RainVMIntegrity ptrSource", async function () {
  let stateBuilder: AllStandardOpsIntegrity;
  let logic: AllStandardOpsTest;

  before(async () => {
    const stateBuilderFactory = await ethers.getContractFactory(
      "AllStandardOpsIntegrity"
    );
    stateBuilder =
      (await stateBuilderFactory.deploy()) as AllStandardOpsIntegrity;
    await stateBuilder.deployed();

    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
    logic = (await logicFactory.deploy(
      stateBuilder.address
    )) as AllStandardOpsTest;
  });

  it("should error when script length is odd", async () => {
    const constants = [];

    const sources = [concat([bytify(Opcode.BLOCK_NUMBER)])];

    await assertError(
      async () => await logic.initialize({ sources, constants }),
      "ODD_SOURCE_LENGTH",
      "did not error when script length is odd"
    );
  });
});
