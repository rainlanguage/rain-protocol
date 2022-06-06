import { Contract } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { AllStandardOpsStateBuilder } from "../../../typechain/AllStandardOpsStateBuilder";
import { FnPtrsTest } from "../../../typechain/FnPtrsTest";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { op } from "../../../utils/rainvm/vm";
import { assertError } from "../../../utils/test/assertError";

const Opcode = AllStandardOps;

describe("RainVM fnPtrs", async function () {
  let stateBuilder: AllStandardOpsStateBuilder & Contract;

  before(async () => {
    this.timeout(0);
    const stateBuilderFactory = await ethers.getContractFactory(
      "AllStandardOpsStateBuilder"
    );
    stateBuilder =
      (await stateBuilderFactory.deploy()) as AllStandardOpsStateBuilder &
        Contract;
    await stateBuilder.deployed();
  });

  it("should error when contract implementing RainVM returns fnPtrs length not divisible by 32 bytes", async () => {
    this.timeout(0);

    const fnPtrsTestFactory = await ethers.getContractFactory("FnPtrsTest");
    const fnPtrsTest = (await fnPtrsTestFactory.deploy(
      stateBuilder.address
    )) as FnPtrsTest & Contract;

    const constants = [1];
    const sources = [concat([op(Opcode.CONSTANT, 0)])];

    await assertError(
      async () => await fnPtrsTest.initialize({ sources, constants }),
      "BAD_FN_PTRS_LENGTH",
      "did not error when contract implementing RainVM returns fnPtrs length not divisible by 32 bytes"
    );
  });
});
