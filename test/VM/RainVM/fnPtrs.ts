import { assert } from "chai";
import { ContractFactory } from "ethers";
import { hexDataLength } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { AllStandardOpsStateBuilder } from "../../../typechain/AllStandardOpsStateBuilder";
import { StandardVM } from "../../../typechain/StandardVM";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";

const Opcode = AllStandardOps;

describe("RainVM fnPtrs", async function () {
  let stateBuilder: AllStandardOpsStateBuilder,
    standardVMFactory: ContractFactory;

  before(async () => {
    const stateBuilderFactory = await ethers.getContractFactory(
      "AllStandardOpsStateBuilder"
    );
    stateBuilder =
      (await stateBuilderFactory.deploy()) as AllStandardOpsStateBuilder;
    await stateBuilder.deployed();
    standardVMFactory = await ethers.getContractFactory("StandardVM");
  });

  it("should pack function pointers to correct bytes length", async () => {
    const standardVM = (await standardVMFactory.deploy(
      stateBuilder.address
    )) as StandardVM;

    const fnPtrs = await standardVM.packedFunctionPointers();

    console.log({ fnPtrs });

    const expectedBytesLength = Opcode.length * 2;
    const actualBytesLength = hexDataLength(fnPtrs);

    assert(
      expectedBytesLength === actualBytesLength,
      "wrong packed function pointers bytes length"
    );
  });
});
