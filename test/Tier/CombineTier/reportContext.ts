import { assert } from "chai";
import { ethers } from "hardhat";
import { concat, hexlify } from "ethers/lib/utils";
import type { Contract } from "ethers";
import type { CombineTier } from "../../../typechain/CombineTier";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { op } from "../../../utils/rainvm/vm";
import { combineTierDeploy } from "../../../utils/deploy/combineTier";

export const Opcode = AllStandardOps;

describe("CombineTier report context", async function () {
  // report time for tier context
  const ctxAccount = op(Opcode.CONTEXT, 0);

  // prettier-ignore
  // return default report
  const sourceReportTimeForTierDefault = concat([
      op(Opcode.THIS_ADDRESS),
      ctxAccount,
    op(Opcode.REPORT),
  ]);

  it("should support a program which simply returns the account", async () => {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const sourceReport = concat([op(Opcode.CONTEXT, 0)]);

    const combineTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [sourceReport, sourceReportTimeForTierDefault],
        constants: [],
      },
    })) as CombineTier & Contract;

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
