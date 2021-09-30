import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import type { VerifyTier } from "../../typechain/VerifyTier";
import type { Verify } from "../../typechain/Verify";

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
    const tierReportApprovedActual = Util.zeroPad32(
      await verifyTier.report(signer1.address)
    );
    const tierReportApprovedExpected =
      "0x0000000700000007000000070000000700000007000000070000000700000007";
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
      "revert CURRENT_STATUS",
      "wrongly approved when Status equals Nil"
    );
    await Util.assertError(
      async () => await verify.connect(verifier).ban(SESSION_ID0),
      "revert CURRENT_STATUS",
      "wrongly banned when Status equals Nil"
    );

    // Add
    await verify.connect(signer1).add(SESSION_ID0);

    await Util.assertError(
      async () => await verify.connect(verifier).add(SESSION_ID0),
      "revert CURRENT_STATUS",
      "wrongly added when Status equals Added"
    );

    // Approve
    await verify.connect(verifier).approve(SESSION_ID0);

    await Util.assertError(
      async () => await verify.connect(verifier).add(SESSION_ID0),
      "revert CURRENT_STATUS",
      "wrongly added when Status equals Approved"
    );
    await Util.assertError(
      async () => await verify.connect(verifier).approve(SESSION_ID0),
      "revert CURRENT_STATUS",
      "wrongly approved when Status equals Approved"
    );

    // Ban
    await verify.connect(verifier).ban(SESSION_ID0);

    await Util.assertError(
      async () => await verify.connect(verifier).add(SESSION_ID0),
      "revert CURRENT_STATUS",
      "wrongly added when Status equals Banned"
    );
    await Util.assertError(
      async () => await verify.connect(verifier).approve(SESSION_ID0),
      "revert CURRENT_STATUS",
      "wrongly approved when Status equals Banned"
    );
    await Util.assertError(
      async () => await verify.connect(verifier).ban(SESSION_ID0),
      "revert CURRENT_STATUS",
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
      state0.status === Status.Nil,
      "status should be uninitialized (Nil)"
    );
    assert(state0.since === 0, "since should be uninitialized");

    await verify.grantRole(await verify.APPROVER(), verifier.address);
    await verify.grantRole(await verify.BANNER(), verifier.address);
    await verify.grantRole(await verify.REMOVER(), verifier.address);

    // signer1 generates and adds verify session id
    const SESSION_ID0 = ethers.BigNumber.from("10765432100123456789");
    await verify.connect(signer1).add(SESSION_ID0);

    const block1 = await ethers.provider.getBlockNumber();
    const state1 = await verify.state(signer1.address);
    assert(state1.status === Status.Added, "status should be Added");
    assert(
      state1.since === block1,
      `expected block1 ${block1} got ${state1.since}`
    );

    // approve verify session
    await verify.connect(verifier).approve(SESSION_ID0);

    const block2 = await ethers.provider.getBlockNumber();
    const state2 = await verify.state(signer1.address);
    assert(state2.status === Status.Approved, "status should be Approved");
    assert(
      state2.since === block2,
      `expected block2 ${block2} got ${state2.since}`
    );

    // ban verify session
    await verify.connect(verifier).ban(SESSION_ID0);

    const block3 = await ethers.provider.getBlockNumber();
    const state3 = await verify.state(signer1.address);
    assert(state3.status === Status.Banned, "status should be Banned");
    assert(
      state3.since === block3,
      `expected block3 ${block3} got ${state3.since}`
    );

    // remove account
    await verify.connect(verifier).remove(signer1.address);

    const state4 = await verify.state(signer1.address);
    assert(state4.status === Status.Nil, "status should be deleted");
    assert(state4.since === 0, "since should be deleted");
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

    const verify = (await verifyFactory.deploy(admin.address)) as Verify;

    const SESSION_ID0 = ethers.BigNumber.from("10765432100123456789");
    const SESSION_ID1 = ethers.BigNumber.from("12345678901234567901");

    // signer1 generates and adds verify session id
    await expect(verify.connect(signer1).add(SESSION_ID0))
      .to.emit(verify, "Add")
      .withArgs(signer1.address, SESSION_ID0);

    // check that signer1 is mapped to verify session
    assert(
      (await verify.ids(signer1.address)).eq(SESSION_ID0),
      "signer1 was not mapped to verify session after adding"
    );

    // prevent creating new verify session id if one exists
    await Util.assertError(
      async () => {
        await verify.connect(signer1).add(SESSION_ID1);
      },
      "revert OVERWRITE_ID",
      "created new verify for signer1 despite one existing"
    );
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
