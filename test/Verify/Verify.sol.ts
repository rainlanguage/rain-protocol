import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import type { VerifyTier } from "../../typechain/VerifyTier";
import type { Verify } from "../../typechain/Verify";
import { max_uint32 } from "../Util";

chai.use(solidity);
const { expect, assert } = chai;

enum Status {
  Nil,
  Added,
  Approved,
  Banned,
}

const APPROVER_ADMIN = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes("APPROVER_ADMIN")
);
const APPROVER = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("APPROVER"));
const REMOVER_ADMIN = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes("REMOVER_ADMIN")
);
const REMOVER = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("REMOVER"));
const BANNER_ADMIN = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes("BANNER_ADMIN")
);
const BANNER = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("BANNER"));

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

    const verify = (await verifyFactory.deploy(admin.address)) as Verify;

    const verifyTier = (await tierFactory.deploy(verify.address)) as VerifyTier;

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
    await verify.connect(verifier).approve(SESSION_ID0);
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
    await verify.connect(verifier).ban(SESSION_ID0);
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

  it("should require correct min/max status", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const admin = signers[0];
    const verifier = signers[1];
    const signer1 = signers[2];

    const verify = (await verifyFactory.deploy(admin.address)) as Verify;

    await verify.grantRole(await verify.APPROVER(), verifier.address);
    await verify.grantRole(await verify.BANNER(), verifier.address);
    await verify.grantRole(await verify.REMOVER(), verifier.address);

    const SESSION_ID0 = ethers.BigNumber.from("10765432100123456789");

    await Util.assertError(
      async () => await verify.connect(verifier).approve(SESSION_ID0),
      "revert NOT_ADDED",
      "wrongly approved when Status equals Nil"
    );
    await Util.assertError(
      async () => await verify.connect(verifier).ban(SESSION_ID0),
      "revert NOT_ADDED",
      "wrongly banned when Status equals Nil"
    );

    // Add
    await verify.connect(signer1).add(SESSION_ID0);

    // Approve
    await verify.connect(verifier).approve(SESSION_ID0);

    await Util.assertError(
      async () => await verify.connect(verifier).approve(SESSION_ID0),
      "revert PRIOR_APPROVE",
      "wrongly approved when Status equals Approved"
    );

    // Ban
    await verify.connect(verifier).ban(SESSION_ID0);

    await Util.assertError(
      async () => await verify.connect(verifier).approve(SESSION_ID0),
      "revert PRIOR_APPROVE",
      "wrongly approved when Status equals Banned"
    );
    await Util.assertError(
      async () => await verify.connect(verifier).ban(SESSION_ID0),
      "revert PRIOR_BAN",
      "wrongly banned when Status equals Banned"
    );

    // Remove
    await verify.connect(verifier).remove(signer1.address);
  });

  it("should require non-zero admin address", async function () {
    this.timeout(0);

    await Util.assertError(
      async () => await verifyFactory.deploy(Util.zeroAddress),
      "revert 0_ACCOUNT",
      "wrongly constructed Verify with admin as zero address"
    );
  });

  it("should return correct state for a given account", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const admin = signers[0];
    const verifier = signers[1];
    const signer1 = signers[2];

    const verify = (await verifyFactory.deploy(admin.address)) as Verify;

    const state0 = await verify.state(signer1.address);
    assert(
      (await verify.statusAtBlock(
        state0,
        await ethers.provider.getBlockNumber()
      )) === Status.Nil,
      "status should be Nil"
    );
    assert(state0.addedSince === 0, `addedSince should be 0, got ${state0}`);
    assert(
      state0.approvedSince === 0,
      `approvedSince should be 0, got ${state0}`
    );
    assert(state0.bannedSince === 0, `bannedSince should be 0, got ${state0}`);

    await verify.grantRole(await verify.APPROVER(), verifier.address);
    await verify.grantRole(await verify.BANNER(), verifier.address);
    await verify.grantRole(await verify.REMOVER(), verifier.address);

    // signer1 generates and adds verify session id
    const SESSION_ID0 = ethers.BigNumber.from("10765432100123456789");
    await verify.connect(signer1).add(SESSION_ID0);

    const block1 = await ethers.provider.getBlockNumber();
    const state1 = await verify.state(signer1.address);
    assert(
      (await verify.statusAtBlock(
        state1,
        await ethers.provider.getBlockNumber()
      )) === Status.Added,
      "status should be Added"
    );
    assert(
      state1.addedSince === block1,
      `addedSince: expected block1 ${block1} got ${state1.addedSince}`
    );
    assert(
      max_uint32.eq(state1.approvedSince),
      `approvedSince should be uninitialized, got ${state1.approvedSince}`
    );
    assert(
      max_uint32.eq(state1.bannedSince),
      `bannedSince should be uninitialized, got ${state1.bannedSince}`
    );

    // approve verify session
    await verify.connect(verifier).approve(SESSION_ID0);

    const block2 = await ethers.provider.getBlockNumber();
    const state2 = await verify.state(signer1.address);
    assert(
      (await verify.statusAtBlock(
        state2,
        await ethers.provider.getBlockNumber()
      )) === Status.Approved,
      "status should be Approved"
    );
    assert(
      state2.addedSince === block1,
      `addedSince: expected block1 ${block1} got ${state2.addedSince}`
    );
    assert(
      state2.approvedSince === block2,
      `approvedSince: expected block2 ${block2} got ${state2.approvedSince}`
    );
    assert(
      max_uint32.eq(state2.bannedSince),
      `bannedSince should be uninitialized, got ${state1.bannedSince}`
    );

    // ban verify session
    await verify.connect(verifier).ban(SESSION_ID0);

    const block3 = await ethers.provider.getBlockNumber();
    const state3 = await verify.state(signer1.address);
    assert(
      (await verify.statusAtBlock(
        state3,
        await ethers.provider.getBlockNumber()
      )) === Status.Banned,
      "status should be Banned"
    );
    assert(
      state3.addedSince === block1,
      `addedSince: expected block1 ${block1} got ${state3.addedSince}`
    );
    assert(
      state3.approvedSince === block2,
      `approvedSince: expected block2 ${block2} got ${state3.approvedSince}`
    );
    assert(
      state3.bannedSince === block3,
      `expected block3 ${block3} got ${state3.bannedSince}`
    );

    // remove account
    await verify.connect(verifier).remove(signer1.address);

    const state4 = await verify.state(signer1.address);
    assert(
      (await verify.statusAtBlock(
        state4,
        await ethers.provider.getBlockNumber()
      )) === Status.Nil,
      "status should be cleared"
    );
    assert(state4.addedSince === 0, "addedSince should be cleared");
    assert(state4.approvedSince === 0, "approvedSince should be cleared");
    assert(state4.bannedSince === 0, "bannedSince should be cleared");
  });

  it("should hold correct public constants", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const admin = signers[0];

    const verify = (await verifyFactory.deploy(admin.address)) as Verify;

    assert(
      (await verify.APPROVER_ADMIN()) === APPROVER_ADMIN,
      "wrong APPROVER_ADMIN hash value"
    );
    assert((await verify.APPROVER()) === APPROVER, "wrong APPROVER hash value");

    assert(
      (await verify.REMOVER_ADMIN()) === REMOVER_ADMIN,
      "wrong REMOVER_ADMIN hash value"
    );
    assert((await verify.REMOVER()) === REMOVER, "wrong REMOVER hash value");

    assert(
      (await verify.BANNER_ADMIN()) === BANNER_ADMIN,
      "wrong BANNER_ADMIN hash value"
    );
    assert((await verify.BANNER()) === BANNER, "wrong BANNER hash value");
  });

  it("should correctly set up access control roles for admin in constructor", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const admin = signers[0];

    const verify = (await verifyFactory.deploy(admin.address)) as Verify;

    // admin (specified in constructor) has all roles
    assert(
      await verify.hasRole(APPROVER_ADMIN, admin.address),
      "admin did not have APPROVER_ADMIN role after construction"
    );
    assert(
      await verify.hasRole(REMOVER_ADMIN, admin.address),
      "admin did not have REMOVER_ADMIN role after construction"
    );
    assert(
      await verify.hasRole(BANNER_ADMIN, admin.address),
      "admin did not have BANNER_ADMIN role after construction"
    );
  });

  it("should allow anyone to map their account to a Verify session id", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const admin = signers[0];
    const signer1 = signers[1];
    const signer2 = signers[1];

    const verify = (await verifyFactory.deploy(admin.address)) as Verify;

    const SESSION_ID0 = ethers.BigNumber.from("10765432100123456789");
    const SESSION_ID1 = ethers.BigNumber.from("12345678901234567901");

    // prevent adding session ID of 0
    await Util.assertError(
      async () => {
        await verify.connect(signer1).add(0);
      },
      "revert 0_ID",
      "wrongly created new verify session with ID of 0"
    );

    // signer1 generates and adds verify session id
    await expect(verify.connect(signer1).add(SESSION_ID0))
      .to.emit(verify, "Add")
      .withArgs(signer1.address, SESSION_ID0);

    // check that signer1 is mapped to verify session
    assert(
      (await verify.ids(signer1.address)).eq(SESSION_ID0),
      "signer1 was not mapped to verify session after adding"
    );

    const state0 = await verify.state(signer1.address);

    // signer1 cannot wipe their own mapping between address -> session id
    await Util.assertError(
      async () => await verify.connect(signer1).add(SESSION_ID1),
      "revert PRIOR_ADD",
      "signer1 wiped their own state"
    );

    const state2 = await verify.state(signer1.address);

    for (let index = 0; index < state0.length; index++) {
      const propertyLeft = state0[index];
      const propertyRight = state2[index];

      assert(
        propertyLeft === propertyRight,
        `state not equivalent at position ${index}. Left ${propertyLeft}, Right ${propertyRight}`
      );
    }

    // another signer should be able to map to the same session id
    await verify.connect(signer2).add(SESSION_ID0);
  });

  it("should allow only admin to approve verify sessions", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const admin = signers[0];
    const signer1 = signers[1];
    const approver = signers[2];
    const nonApprover = signers[3];

    const verify = (await verifyFactory.deploy(admin.address)) as Verify;

    await verify.grantRole(await verify.APPROVER(), approver.address);

    const SESSION_ID0 = ethers.BigNumber.from("10765432100123456789");

    // signer1 generates and adds verify session id
    await verify.connect(signer1).add(SESSION_ID0);

    // prevent approving session ID of 0
    await Util.assertError(
      async () => await verify.connect(approver).approve(0),
      "revert 0_ID",
      "wrongly approved session with ID of 0"
    );

    await Util.assertError(
      async () => await verify.connect(nonApprover).approve(SESSION_ID0),
      "revert ONLY_APPROVER",
      "non-approver wrongly approved session"
    );

    // approve verify session
    await expect(verify.connect(approver).approve(SESSION_ID0))
      .to.emit(verify, "Approve")
      .withArgs(SESSION_ID0);
  });

  it("should allow only admin to remove accounts", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const admin = signers[0];
    const signer1 = signers[1];
    const remover = signers[2];
    const nonRemover = signers[3];

    const verify = (await verifyFactory.deploy(admin.address)) as Verify;

    await verify.grantRole(await verify.REMOVER(), remover.address);

    const SESSION_ID0 = ethers.BigNumber.from("10765432100123456789");

    // signer1 generates and adds verify session id
    await verify.connect(signer1).add(SESSION_ID0);

    // prevent removing account of address 0
    await Util.assertError(
      async () => await verify.connect(remover).remove(Util.zeroAddress),
      "revert 0_ADDRESS",
      "wrongly removed account with address of 0"
    );

    await Util.assertError(
      async () => await verify.connect(nonRemover).remove(signer1.address),
      "revert ONLY_REMOVER",
      "non-remover wrongly removed account"
    );

    // admin removes account
    await expect(verify.connect(remover).remove(signer1.address))
      .to.emit(verify, "Remove")
      .withArgs(signer1.address);

    // check that signer1 has been deleted
    assert(
      (await verify.ids(signer1.address)).isZero(),
      "failed to remove address from verify session map"
    );
  });

  it("should allow only admin to ban verify sessions", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const admin = signers[0];
    const signer1 = signers[1];
    const banner = signers[2];
    const nonBanner = signers[3];

    const verify = (await verifyFactory.deploy(admin.address)) as Verify;

    await verify.grantRole(await verify.BANNER(), banner.address);

    const SESSION_ID0 = ethers.BigNumber.from("10765432100123456789");

    // signer1 generates and adds verify session id
    await verify.connect(signer1).add(SESSION_ID0);

    // prevent banning session ID of 0
    await Util.assertError(
      async () => await verify.connect(banner).ban(0),
      "revert 0_ID",
      "wrongly banning session ID of 0"
    );

    await Util.assertError(
      async () => await verify.connect(nonBanner).ban(SESSION_ID0),
      "revert ONLY_BANNER",
      "non-banner wrongly banned session"
    );

    // admin bans verify session
    await expect(verify.connect(banner).ban(SESSION_ID0))
      .to.emit(verify, "Ban")
      .withArgs(SESSION_ID0);
  });
});
