import { assert } from "chai";
import { concat, hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { CombineTier } from "../../../typechain";
import { combineTierDeploy } from "../../../utils/deploy/tier/combineTier/deploy";
import { op } from "../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";

const Opcode = AllStandardOps;

describe("CombineTier report context tests", async function () {
  // report time for tier context
  const ctxAccount = op(Opcode.CONTEXT, 0x0000);

  // prettier-ignore
  // return default report
  const sourceReportTimeForTierDefault = concat([
      op(Opcode.THIS_ADDRESS),
      ctxAccount,
    op(Opcode.ITIERV2_REPORT),
  ]);

  it("should support a program which simply returns the account", async () => {
    const signers = await ethers.getSigners();

    const sourceReport = concat([op(Opcode.CONTEXT, 0x0000)]);

    const combineTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      stateConfig: {
        sources: [sourceReport, sourceReportTimeForTierDefault],
        constants: [],
      },
      expressionDeployer: "",
      interpreter: "",
    })) as CombineTier;

    const result = await combineTier.report(signers[1].address, []);
    const expected = signers[1].address;
    assert(
      result.eq(expected),
      `wrong account address
      expected  ${hexlify(expected)}
      got       ${hexlify(result)}`
    );
  });
});
