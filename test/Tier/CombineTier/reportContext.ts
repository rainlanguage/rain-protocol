import { assert } from "chai";
import { concat, hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { CombineTier } from "../../../typechain/CombineTier";
import { combineTierDeploy } from "../../../utils/deploy/combineTier";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { op, memoryOperand, MemoryType } from "../../../utils/rainvm/vm";

const Opcode = AllStandardOps;

describe("CombineTier report context", async function () {
  // report time for tier context
  const ctxAccount = op(Opcode.MEMORY, memoryOperand(MemoryType.Context, 0));

  // prettier-ignore
  // return default report
  const sourceReportTimeForTierDefault = concat([
      op(Opcode.THIS_ADDRESS),
      ctxAccount,
    op(Opcode.ITIERV2_REPORT),
  ]);

  it("should support a program which simply returns the account", async () => {
    const signers = await ethers.getSigners();

    const sourceReport = concat([
      op(Opcode.MEMORY, memoryOperand(MemoryType.Context, 0)),
    ]);

    const combineTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [sourceReport, sourceReportTimeForTierDefault],
        constants: [],
      },
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
