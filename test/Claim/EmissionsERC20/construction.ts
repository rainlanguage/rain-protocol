import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { InitializeEvent } from "../../../typechain/EmissionsERC20";
import { claimFactoriesDeploy } from "../../../utils/deploy/claim";
import { emissionsDeploy } from "../../../utils/deploy/emissions";
import { getEventArgs } from "../../../utils/events";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { op, memoryOperand, MemoryType } from "../../../utils/rainvm/vm";
import { compareStructs } from "../../../utils/test/compareStructs";

const Opcode = AllStandardOps;

describe("EmissionsERC20 construction", async () => {
  it("should construct and initialize correctly", async function () {
    const signers = await ethers.getSigners();
    const creator = signers[0];

    const { emissionsERC20Factory } = await claimFactoriesDeploy();

    const emissionsERC20Config = {
      allowDelegatedClaims: true,
      erc20Config: {
        name: "Emissions",
        symbol: "EMS",
        distributor: signers[0].address,
        initialSupply: 0,
      },
      vmStateConfig: {
        sources: [
          concat([op(Opcode.MEMORY, memoryOperand(MemoryType.Constant, 0))]),
        ],
        constants: [0],
      },
    };

    const emissionsERC20 = await emissionsDeploy(
      creator,
      emissionsERC20Factory,
      emissionsERC20Config
    );

    assert(emissionsERC20.deployTransaction);
    assert(await emissionsERC20.allowDelegatedClaims());

    const { sender, config } = (await getEventArgs(
      emissionsERC20.deployTransaction,
      "Initialize",
      emissionsERC20
    )) as InitializeEvent["args"];
    assert(sender === emissionsERC20Factory.address, "wrong signer");
    compareStructs(config, emissionsERC20Config);
  });
});
