import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
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

const APPROVER_ADMIN_ADMIN = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes("APPROVER_ADMIN_ADMIN")
);
const APPROVER_ADMIN = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes("APPROVER_ADMIN")
);
const APPROVER = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("APPROVER"));

const REMOVER_ADMIN_ADMIN = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes("REMOVER_ADMIN_ADMIN")
);
const REMOVER_ADMIN = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes("REMOVER_ADMIN")
);
const REMOVER = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("REMOVER"));

const BANNER_ADMIN_ADMIN = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes("BANNER_ADMIN_ADMIN")
);
const BANNER_ADMIN = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes("BANNER_ADMIN")
);
const BANNER = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("BANNER"));

let verifyFactory;

describe("Verify", async function () {
  before(async () => {
    verifyFactory = await ethers.getContractFactory("Verify");
  });

  it("should allow admin to delegate admin roles", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const chadAdmin = signers[0];
    const betaAdmin = signers[1];

    const verify = (await verifyFactory.deploy(chadAdmin.address)) as Verify;

    /* chadAdmin grants betaAdmin admin roles
     these could obviously be granted across multiple addresses, e.g.
      - 'betaAdminApprovals' address for granting verifiers approval privileges
      - 'betaAdminRemoving' address for granting verifiers removal privileges
      - 'betaAdminBanning' address for granting verifiers ban privileges
    */
    await verify.grantRole(await verify.APPROVER_ADMIN(), betaAdmin.address);
    await verify.grantRole(await verify.REMOVER_ADMIN(), betaAdmin.address);
    await verify.grantRole(await verify.BANNER_ADMIN(), betaAdmin.address);
  });

  it("should allow admin to delegate admin roles which can then grant non-admin roles", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const chadAdmin = signers[0];
    const betaAdmin = signers[1];
    const verifier = signers[2];

    const verify = (await verifyFactory.deploy(chadAdmin.address)) as Verify;

    // chadAdmin grants betaAdmin admin roles
    await verify.grantRole(await verify.APPROVER_ADMIN(), betaAdmin.address);
    await verify.grantRole(await verify.REMOVER_ADMIN(), betaAdmin.address);
    await verify.grantRole(await verify.BANNER_ADMIN(), betaAdmin.address);

    // grant verifier roles
    await verify
      .connect(betaAdmin)
      .grantRole(await verify.APPROVER(), verifier.address);
    await verify
      .connect(betaAdmin)
      .grantRole(await verify.REMOVER(), verifier.address);
    await verify
      .connect(betaAdmin)
      .grantRole(await verify.BANNER(), verifier.address);

    const approverCount0 = await verify.getRoleMemberCount(
      await verify.APPROVER()
    );
    const removerCount0 = await verify.getRoleMemberCount(
      await verify.REMOVER()
    );
    const bannerCount0 = await verify.getRoleMemberCount(await verify.BANNER());

    assert(approverCount0.eq(1), `expected 1, got ${approverCount0}`);
    assert(removerCount0.eq(1), `expected 1, got ${removerCount0}`);
    assert(bannerCount0.eq(1), `expected 1, got ${bannerCount0}`);

    // if admin wants to become an approver, remover or banner, they should grant themselves admin roles and then verifier roles
    await verify.grantRole(await verify.APPROVER_ADMIN(), chadAdmin.address);
    await verify.grantRole(await verify.REMOVER_ADMIN(), chadAdmin.address);
    await verify.grantRole(await verify.BANNER_ADMIN(), chadAdmin.address);
    await verify.grantRole(await verify.APPROVER(), chadAdmin.address);
    await verify.grantRole(await verify.REMOVER(), chadAdmin.address);
    await verify.grantRole(await verify.BANNER(), chadAdmin.address);

    const approverCount1 = await verify.getRoleMemberCount(
      await verify.APPROVER()
    );
    const removerCount1 = await verify.getRoleMemberCount(
      await verify.REMOVER()
    );
    const bannerCount1 = await verify.getRoleMemberCount(await verify.BANNER());

    assert(approverCount1.eq(2), `expected 2, got ${approverCount1}`);
    assert(removerCount1.eq(2), `expected 2, got ${removerCount1}`);
    assert(bannerCount1.eq(2), `expected 2, got ${bannerCount1}`);
  });

  it("statusAtBlock should return correct status for any given state & block number", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const chadAdmin = signers[0];
    const betaAdmin = signers[1];
    const verifier = signers[2];
    const signer1 = signers[3];

    const verify = (await verifyFactory.deploy(chadAdmin.address)) as Verify;

    const state0 = await verify.state(signer1.address);
    assert(
      (await verify.statusAtBlock(
        state0,
        await ethers.provider.getBlockNumber()
      )) === Status.Nil,
      "status should be Nil"
    );

    // chadAdmin grants betaAdmin admin roles
    await verify.grantRole(await verify.APPROVER_ADMIN(), betaAdmin.address);
    await verify.grantRole(await verify.REMOVER_ADMIN(), betaAdmin.address);
    await verify.grantRole(await verify.BANNER_ADMIN(), betaAdmin.address);

    await verify
      .connect(betaAdmin)
      .grantRole(await verify.APPROVER(), verifier.address);
    await verify
      .connect(betaAdmin)
      .grantRole(await verify.BANNER(), verifier.address);
    await verify
      .connect(betaAdmin)
      .grantRole(await verify.REMOVER(), verifier.address);

    const blockBeforeAdd = await ethers.provider.getBlockNumber();

    // signer1 adds arbitrary session id
    const SESSION_ID0 = ethers.BigNumber.from("10765432100123456789");
    await verify.connect(signer1).add(SESSION_ID0);

    const state1 = await verify.state(signer1.address);
    assert(
      (await verify.statusAtBlock(
        state1,
        await ethers.provider.getBlockNumber()
      )) === Status.Added,
      "status should be Added"
    );

    const blockBeforeApprove = await ethers.provider.getBlockNumber();

    // approve account
    await verify.connect(verifier).approve(signer1.address);

    const state2 = await verify.state(signer1.address);
    assert(
      (await verify.statusAtBlock(
        state2,
        await ethers.provider.getBlockNumber()
      )) === Status.Approved,
      "status should be Approved"
    );

    const blockBeforeBan = await ethers.provider.getBlockNumber();

    // ban account
    await verify.connect(verifier).ban(signer1.address);

    const state3 = await verify.state(signer1.address);
    assert(
      (await verify.statusAtBlock(
        state3,
        await ethers.provider.getBlockNumber()
      )) === Status.Banned,
      "status should be Banned"
    );

    // interrogate history using latest state, before being cleared with `.remove()`
    assert(
      (await verify.statusAtBlock(state3, blockBeforeAdd)) === Status.Nil,
      "status should be Nil before add"
    );
    assert(
      (await verify.statusAtBlock(state3, blockBeforeApprove)) === Status.Added,
      "status should be Added before approve"
    );
    assert(
      (await verify.statusAtBlock(state3, blockBeforeBan)) === Status.Approved,
      "status should be Approved before ban"
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
  });

  it("should require correct min/max status", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const chadAdmin = signers[0];
    const betaAdmin = signers[1];
    const verifier = signers[2];
    const signer1 = signers[3];

    const verify = (await verifyFactory.deploy(chadAdmin.address)) as Verify;

    // chadAdmin grants betaAdmin admin roles
    await verify.grantRole(await verify.APPROVER_ADMIN(), betaAdmin.address);
    await verify.grantRole(await verify.REMOVER_ADMIN(), betaAdmin.address);
    await verify.grantRole(await verify.BANNER_ADMIN(), betaAdmin.address);

    await verify
      .connect(betaAdmin)
      .grantRole(await verify.APPROVER(), verifier.address);
    await verify
      .connect(betaAdmin)
      .grantRole(await verify.BANNER(), verifier.address);
    await verify
      .connect(betaAdmin)
      .grantRole(await verify.REMOVER(), verifier.address);

    const SESSION_ID0 = ethers.BigNumber.from("10765432100123456789");

    await Util.assertError(
      async () => await verify.connect(verifier).approve(signer1.address),
      "revert NOT_ADDED",
      "wrongly approved when Status equals Nil"
    );
    await Util.assertError(
      async () => await verify.connect(verifier).ban(signer1.address),
      "revert NOT_ADDED",
      "wrongly banned when Status equals Nil"
    );

    // Add
    await verify.connect(signer1).add(SESSION_ID0);

    // Approve
    await verify.connect(verifier).approve(signer1.address);

    await Util.assertError(
      async () => await verify.connect(verifier).approve(signer1.address),
      "revert PRIOR_APPROVE",
      "wrongly approved when Status equals Approved"
    );

    // Ban
    await verify.connect(verifier).ban(signer1.address);

    await Util.assertError(
      async () => await verify.connect(verifier).approve(signer1.address),
      "revert PRIOR_APPROVE",
      "wrongly approved when Status equals Banned"
    );
    await Util.assertError(
      async () => await verify.connect(verifier).ban(signer1.address),
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
    const chadAdmin = signers[0];
    const betaAdmin = signers[1];
    const verifier = signers[2];
    const signer1 = signers[3];

    const verify = (await verifyFactory.deploy(chadAdmin.address)) as Verify;

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

    // chadAdmin grants betaAdmin admin roles
    await verify.grantRole(await verify.APPROVER_ADMIN(), betaAdmin.address);
    await verify.grantRole(await verify.REMOVER_ADMIN(), betaAdmin.address);
    await verify.grantRole(await verify.BANNER_ADMIN(), betaAdmin.address);

    await verify
      .connect(betaAdmin)
      .grantRole(await verify.APPROVER(), verifier.address);
    await verify
      .connect(betaAdmin)
      .grantRole(await verify.BANNER(), verifier.address);
    await verify
      .connect(betaAdmin)
      .grantRole(await verify.REMOVER(), verifier.address);

    // signer1 adds arbitrary session id
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

    // approve account
    await verify.connect(verifier).approve(signer1.address);

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

    // ban account
    await verify.connect(verifier).ban(signer1.address);

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
      await verify.hasRole(APPROVER_ADMIN_ADMIN, admin.address),
      "admin did not have APPROVER_ADMIN_ADMIN role after construction"
    );
    assert(
      await verify.hasRole(REMOVER_ADMIN_ADMIN, admin.address),
      "admin did not have REMOVER_ADMIN_ADMIN role after construction"
    );
    assert(
      await verify.hasRole(BANNER_ADMIN_ADMIN, admin.address),
      "admin did not have BANNER_ADMIN_ADMIN role after construction"
    );
  });

  it("should allow anyone to map their account to a session id", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const admin = signers[0];
    const signer1 = signers[1];
    const signer2 = signers[2];

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

    // signer1 adds session id
    await expect(verify.connect(signer1).add(SESSION_ID0))
      .to.emit(verify, "Add")
      .withArgs(signer1.address, SESSION_ID0);

    // check that signer1 is mapped to verify session
    assert(
      (await verify.state(signer1.address)).id.eq(SESSION_ID0),
      "signer1 was not mapped to session id after adding"
    );

    const state0 = await verify.state(signer1.address);

    // signer1 cannot wipe their own mapping between address -> session id
    await Util.assertError(
      async () => await verify.connect(signer1).add(SESSION_ID1),
      "revert PRIOR_ADD",
      "signer1 wiped their own state"
    );

    // another signer should be able to map to the same session id
    await verify.connect(signer2).add(SESSION_ID0);

    // signer2 adding same id for their account should not wipe state for signer1
    const state2 = await verify.state(signer1.address);
    for (let index = 0; index < state0.length; index++) {
      const propertyLeft = `${state0[index]}`;
      const propertyRight = `${state2[index]}`;
      assert(
        propertyLeft === propertyRight,
        `state not equivalent at position ${index}. Left ${propertyLeft}, Right ${propertyRight}`
      );
    }
  });

  it("should allow only verifier to approve accounts", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const chadAdmin = signers[0];
    const betaAdmin = signers[1];
    const signer1 = signers[2];
    const approver = signers[3];
    const nonApprover = signers[4];

    const verify = (await verifyFactory.deploy(chadAdmin.address)) as Verify;

    // chadAdmin grants betaAdmin approver admin role
    await verify.grantRole(await verify.APPROVER_ADMIN(), betaAdmin.address);
    await verify
      .connect(betaAdmin)
      .grantRole(await verify.APPROVER(), approver.address);

    const SESSION_ID0 = ethers.BigNumber.from("10765432100123456789");

    // signer1 adds session id
    await verify.connect(signer1).add(SESSION_ID0);

    // prevent approving zero address
    await Util.assertError(
      async () => await verify.connect(approver).approve(Util.zeroAddress),
      "revert 0_ADDRESS",
      "wrongly approved account with address of 0"
    );

    await Util.assertError(
      async () => await verify.connect(nonApprover).approve(signer1.address),
      "revert ONLY_APPROVER",
      "non-approver wrongly approved account"
    );

    // approve account
    await expect(verify.connect(approver).approve(signer1.address))
      .to.emit(verify, "Approve")
      .withArgs(signer1.address);

    // check that signer1 has been approved
    const stateApproved = await verify.state(signer1.address);
    assert(
      stateApproved.approvedSince === (await ethers.provider.getBlockNumber()),
      "not approved"
    );
  });

  it("should allow only verifier to remove accounts", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const chadAdmin = signers[0];
    const betaAdmin = signers[1];
    const signer1 = signers[2];
    const remover = signers[3];
    const nonRemover = signers[4];

    const verify = (await verifyFactory.deploy(chadAdmin.address)) as Verify;

    // chadAdmin grants betaAdmin remover admin role
    await verify.grantRole(await verify.REMOVER_ADMIN(), betaAdmin.address);
    await verify
      .connect(betaAdmin)
      .grantRole(await verify.REMOVER(), remover.address);

    const SESSION_ID0 = ethers.BigNumber.from("10765432100123456789");

    // signer1 adds session id
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

    // check that signer1 has been removed
    const stateRemoved = await verify.state(signer1.address);
    assert(stateRemoved.addedSince === 0, "not removed");
    assert(stateRemoved.approvedSince === 0, "not removed");
    assert(stateRemoved.bannedSince === 0, "not removed");
    assert(stateRemoved.id.isZero(), "not removed");
  });

  it("should allow only verifier to ban verify sessions", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const chadAdmin = signers[0];
    const betaAdmin = signers[1];
    const signer1 = signers[2];
    const banner = signers[3];
    const nonBanner = signers[4];

    const verify = (await verifyFactory.deploy(chadAdmin.address)) as Verify;

    // chadAdmin grants betaAdmin banner admin role
    await verify.grantRole(await verify.BANNER_ADMIN(), betaAdmin.address);
    await verify
      .connect(betaAdmin)
      .grantRole(await verify.BANNER(), banner.address);

    const SESSION_ID0 = ethers.BigNumber.from("10765432100123456789");

    // signer1 adds session id
    await verify.connect(signer1).add(SESSION_ID0);

    // prevent banning zero address
    await Util.assertError(
      async () => await verify.connect(banner).ban(Util.zeroAddress),
      "revert 0_ADDRESS",
      "wrongly banning zero address"
    );

    await Util.assertError(
      async () => await verify.connect(nonBanner).ban(signer1.address),
      "revert ONLY_BANNER",
      "non-banner wrongly banned session"
    );

    // admin bans account
    await expect(verify.connect(banner).ban(signer1.address))
      .to.emit(verify, "Ban")
      .withArgs(signer1.address);

    // check that signer1 has been banned
    const stateBanned = await verify.state(signer1.address);
    assert(
      stateBanned.bannedSince === (await ethers.provider.getBlockNumber()),
      "not banned"
    );
  });
});
