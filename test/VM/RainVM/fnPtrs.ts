import { ContractFactory } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { AllStandardOpsStateBuilder } from "../../../typechain/AllStandardOpsStateBuilder";
import { FnPtrsTest } from "../../../typechain/FnPtrsTest";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { op } from "../../../utils/rainvm/vm";
import { assertError } from "../../../utils/test/assertError";

const Opcode = AllStandardOps;

describe("RainVM fnPtrs", async function () {
  let stateBuilder: AllStandardOpsStateBuilder,
    fnPtrsTestFactory: ContractFactory;

  before(async () => {
    const stateBuilderFactory = await ethers.getContractFactory(
      "AllStandardOpsStateBuilder"
    );
    stateBuilder =
      (await stateBuilderFactory.deploy()) as AllStandardOpsStateBuilder;
    await stateBuilder.deployed();
    fnPtrsTestFactory = await ethers.getContractFactory("FnPtrsTest");
  });

  xit("should error when contract implementing RainVM returns bad fn ptrs length", async () => {
    throw new Error("untested / invalid test");

    const fnPtrsTest = (await fnPtrsTestFactory.deploy(
      stateBuilder.address
    )) as FnPtrsTest;

    const constants = [1];
    const sources = [concat([op(Opcode.CONSTANT, 0)])];

    await assertError(
      async () => await fnPtrsTest.initialize({ sources, constants }),
      "BAD_FN_PTRS_LENGTH",
      "did not error when contract implementing RainVM returns bad fn ptrs length"
    );
  });
});
