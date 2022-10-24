import { ethers } from "hardhat";
import type { LibEvidenceTest } from "../../../typechain";
import { EvidenceStruct } from "../../../typechain/contracts/test/verify/LibEvidence/LibEvidenceTest";
import { libEvidenceDeploy } from "../../../utils/deploy/verify/libEvidence/deploy";
import { compareStructs } from "../../../utils/test/compareStructs";

describe("LibEvidence tests", async function () {
  let libEvidence: LibEvidenceTest;

  before(async () => {
    libEvidence = await libEvidenceDeploy();
  });

  it("should update several refs with evidence", async function () {
    const signers = await ethers.getSigners();

    const evidences: EvidenceStruct[] = [
      {
        account: signers[1].address,
        data: "0x0001",
      },
      {
        account: signers[2].address,
        data: "0x0002",
      },
    ];

    const evidencesFromRefs_ =
      await libEvidence.updateEvidenceRefsAndReturnEvidencesFromRefs(evidences);

    evidencesFromRefs_.forEach((evidence, i_) => {
      compareStructs(evidence, evidences[i_]);
    });
  });

  it("should update ref with evidence", async function () {
    const signers = await ethers.getSigners();

    const evidence: EvidenceStruct = {
      account: signers[1].address,
      data: "0x0001",
    };

    const evidenceFromRef_ =
      await libEvidence.updateEvidenceRefAndReturnEvidenceFromRef(evidence);

    compareStructs(evidenceFromRef_, evidence);
  });
});
