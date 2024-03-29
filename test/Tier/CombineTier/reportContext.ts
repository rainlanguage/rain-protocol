import { strict as assert } from "assert";
import { concat, hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { CloneFactory, CombineTier } from "../../../typechain";
import { flowCloneFactory } from "../../../utils/deploy/factory/cloneFactory";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
import {
  combineTierCloneDeploy,
  combineTierImplementation,
} from "../../../utils/deploy/tier/combineTier/deploy";
import {
  generateEvaluableConfig,
  op,
} from "../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";

const Opcode = AllStandardOps;

describe("CombineTier report context tests", async function () {
  let implementationCombineTier: CombineTier;

  let cloneFactory: CloneFactory;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementationCombineTier = await combineTierImplementation();

    //Deploy Clone Factory
    cloneFactory = await flowCloneFactory();
  });

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
    const deployer = signers[0];
    const sourceReport = concat([op(Opcode.context, 0x0100)]);
    const evaluableConfig = await generateEvaluableConfig(
      [sourceReport, sourceReportTimeForTierDefault],
      []
    );

    const combineTier = await combineTierCloneDeploy(
      deployer,
      cloneFactory,
      implementationCombineTier,
      0,
      evaluableConfig
    );

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
