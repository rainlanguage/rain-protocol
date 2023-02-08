import { assert } from "chai";
import { concat, hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { CombineTier } from "../../../typechain";
import { combineTierDeploy } from "../../../utils/deploy/tier/combineTier/deploy";
import {
  generateEvaluableConfig,
  op,
} from "../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";

const Opcode = AllStandardOps;

describe("CombineTier report context tests", async function () {
  // report time for tier context
  const ctxAccount = op(Opcode.context, 0x0000);

  // prettier-ignore
  // return default report
  const sourceReportTimeForTierDefault = concat([
      op(Opcode.context, 0x0001),
      ctxAccount,
    op(Opcode.itier_v2_report),
  ]);

  it("should support a program which simply returns the account", async () => {
    const signers = await ethers.getSigners();

    const sourceReport = concat([op(Opcode.context, 0x0100)]);
    const evaluableConfig = await generateEvaluableConfig({
      sources: [sourceReport, sourceReportTimeForTierDefault],
      constants: [],
    });

    const combineTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      evaluableConfig: evaluableConfig,
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
