import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import type { VerifyTier } from "../../typechain/VerifyTier";
import type { Verify } from "../../typechain/Verify";
import type { Contract } from "ethers";

chai.use(solidity);
const { expect, assert } = chai;

enum Status {
  Nil,
  Added,
  Approved,
  Banned,
}

let verifyFactory;

describe("Verify", async function () {
  before(async () => {
    verifyFactory = await ethers.getContractFactory("Verify");
  });

  it("should correctly verify tier", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const admin = signers[0];
    const verifier = signers[1];
    const signer1 = signers[2];

    const tierFactory = await ethers.getContractFactory("VerifyTier");

    const verify = (await verifyFactory.deploy(admin.address)) as Verify &
      Contract;

    const verifyTier = (await tierFactory.deploy(
      verify.address
    )) as VerifyTier & Contract;

    await verify.grantRole(await verify.APPROVER(), verifier.address);
    await verify.grantRole(await verify.BANNER(), verifier.address);
    await verify.grantRole(await verify.REMOVER(), verifier.address);

    const tierReportNil = await verifyTier.report(signer1.address);
    assert(
      tierReportNil.eq(Util.max_uint256),
      "Nil status did not return max uint256"
    );

    const SESSION_ID0 = ethers.BigNumber.from("10765432100123456789");

    // Add
    await verify.connect(signer1).add(SESSION_ID0);
    const tierReportAdded = await verifyTier.report(signer1.address);
    assert(
      tierReportAdded.eq(Util.max_uint256),
      "Added status did not return max uint256"
    );

    // Approve
    await verify.connect(verifier).approve(signer1.address);
    const blockApproved = await ethers.provider.getBlockNumber();
    const tierReportApprovedActual = Util.zeroPad32(
      await verifyTier.report(signer1.address)
    );
    const tierReportApprovedExpected =
      "0x" +
      Util.zeroPad4(ethers.BigNumber.from(blockApproved)).slice(2).repeat(8);
    assert(
      tierReportApprovedActual === tierReportApprovedExpected,
      `Approved status did not return correct report
      expected  ${tierReportApprovedExpected}
      got       ${tierReportApprovedActual}`
    );

    // Ban
    await verify.connect(verifier).ban(signer1.address);
    const tierReportBanned = await verifyTier.report(signer1.address);
    assert(
      tierReportBanned.eq(Util.max_uint256),
      "Banned status did not return max uint256"
    );

    // Remove
    await verify.connect(verifier).remove(signer1.address);
    const tierReportRemoved = await verifyTier.report(signer1.address);
    assert(
      tierReportRemoved.eq(Util.max_uint256),
      "Nil status (removed) did not return max uint256"
    );
  });
});
