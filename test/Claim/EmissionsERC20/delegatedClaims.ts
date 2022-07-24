import { assert } from "chai";
import { concat, hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import * as Util from "../../../utils";
import { op, memoryOperand, MemoryType } from "../../../utils";
import { claimFactoriesDeploy } from "../../../utils/deploy/claim";
import { emissionsDeploy } from "../../../utils/deploy/emissions";

const Opcode = Util.AllStandardOps;

describe("EmissionsERC20 Delegated Claims Test", async function () {
  it("should prevent delegated claims when flag set to false", async function () {
    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimant = signers[1];
    const delegate = signers[2];

    const claimAmount = 123;

    const { emissionsERC20Factory } = await claimFactoriesDeploy();

    const emissionsERC20 = await emissionsDeploy(
      creator,
      emissionsERC20Factory,
      {
        allowDelegatedClaims: false,
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
          constants: [claimAmount],
        },
      }
    );

    assert(!(await emissionsERC20.allowDelegatedClaims()));

    await Util.assertError(
      async () =>
        await emissionsERC20
          .connect(delegate)
          .claim(
            claimant.address,
            hexlify([...Buffer.from("Custom claim message")])
          ),
      "DELEGATED_CLAIM",
      "did not prevent delegated claim when flag was set to false"
    );
  });

  it("should allow delegated claims when flag set to true", async function () {
    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimant = signers[1];
    const delegate = signers[2];

    const claimAmount = 123;

    const { emissionsERC20Factory } = await claimFactoriesDeploy();

    const emissionsERC20 = await emissionsDeploy(
      creator,
      emissionsERC20Factory,
      {
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
          constants: [claimAmount],
        },
      }
    );

    await emissionsERC20
      .connect(delegate)
      .claim(
        claimant.address,
        hexlify([...Buffer.from("Custom claim message")])
      );
  });
});
