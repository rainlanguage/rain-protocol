import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import type { Verify } from "../../typechain/Verify";
import { max_uint32 } from "../Util";
import { hexlify } from "ethers/lib/utils";

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

  it("should allow anyone to submit data to support a request to ban an account", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const defaultAdmin = signers[0];
    // admins
    const aprAdmin = signers[1];
    const rmvAdmin = signers[2];
    const banAdmin = signers[3];
    // verifiers
    const approver = signers[4];
    const remover = signers[5];
    const banner = signers[6];
    // signers
    const signer1 = signers[7];
    const signer2 = signers[8];

    const verify = (await verifyFactory.deploy(defaultAdmin.address)) as Verify;

    // defaultAdmin grants admin roles
    await verify.grantRole(await verify.APPROVER_ADMIN(), aprAdmin.address);
    await verify.grantRole(await verify.REMOVER_ADMIN(), rmvAdmin.address);
    await verify.grantRole(await verify.BANNER_ADMIN(), banAdmin.address);

    // defaultAdmin leaves. This removes a big risk
    await verify.renounceRole(
      await verify.DEFAULT_ADMIN_ROLE(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.APPROVER_ADMIN(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.REMOVER_ADMIN(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.BANNER_ADMIN(),
      defaultAdmin.address
    );

    // admins grant verifiers roles
    await verify
      .connect(aprAdmin)
      .grantRole(await verify.APPROVER(), approver.address);
    await verify
      .connect(rmvAdmin)
      .grantRole(await verify.REMOVER(), remover.address);
    await verify
      .connect(banAdmin)
      .grantRole(await verify.BANNER(), banner.address);

    // signer1 adds their account and is approved
    const evidenceAdd0 = hexlify([...Buffer.from("Evidence for add")]);
    const evidenceApprove0 = hexlify([...Buffer.from("Evidence for approve")]);

    await verify.connect(signer1).add(evidenceAdd0);
    await verify.connect(approver).approve(signer1.address, evidenceApprove0);

    const evidenceBanReq = hexlify([
      ...Buffer.from("Evidence for ban request"),
    ]);

    // unapproved signer2 requests ban of signer1 account
    await Util.assertError(
      async () =>
        verify.connect(signer2).requestBan(signer1.address, evidenceBanReq),
      "ONLY_APPROVED",
      "signer2 requested ban despite not being an approved account"
    );

    // signer2 adds their account and is approved
    const evidenceAdd1 = hexlify([...Buffer.from("Evidence for add")]);
    const evidenceApprove1 = hexlify([...Buffer.from("Evidence for approve")]);

    await verify.connect(signer2).add(evidenceAdd1);
    await verify.connect(approver).approve(signer2.address, evidenceApprove1);

    // signer2 requests ban of signer1 account
    await expect(
      verify.connect(signer2).requestBan(signer1.address, evidenceBanReq)
    )
      .to.emit(verify, "RequestBan")
      .withArgs(signer2.address, signer1.address, evidenceBanReq);
  });

  it("should allow anyone to submit data to support a request to remove an account", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const defaultAdmin = signers[0];
    // admins
    const aprAdmin = signers[1];
    const rmvAdmin = signers[2];
    const banAdmin = signers[3];
    // verifiers
    const approver = signers[4];
    const remover = signers[5];
    const banner = signers[6];
    // signers
    const signer1 = signers[7];
    const signer2 = signers[8];

    const verify = (await verifyFactory.deploy(defaultAdmin.address)) as Verify;

    // defaultAdmin grants admin roles
    await verify.grantRole(await verify.APPROVER_ADMIN(), aprAdmin.address);
    await verify.grantRole(await verify.REMOVER_ADMIN(), rmvAdmin.address);
    await verify.grantRole(await verify.BANNER_ADMIN(), banAdmin.address);

    // defaultAdmin leaves. This removes a big risk
    await verify.renounceRole(
      await verify.DEFAULT_ADMIN_ROLE(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.APPROVER_ADMIN(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.REMOVER_ADMIN(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.BANNER_ADMIN(),
      defaultAdmin.address
    );

    // admins grant verifiers roles
    await verify
      .connect(aprAdmin)
      .grantRole(await verify.APPROVER(), approver.address);
    await verify
      .connect(rmvAdmin)
      .grantRole(await verify.REMOVER(), remover.address);
    await verify
      .connect(banAdmin)
      .grantRole(await verify.BANNER(), banner.address);

    // signer1 adds their account and is approved
    const evidenceAdd0 = hexlify([...Buffer.from("Evidence for add")]);
    const evidenceApprove0 = hexlify([...Buffer.from("Evidence for approve")]);

    await verify.connect(signer1).add(evidenceAdd0);
    await verify.connect(approver).approve(signer1.address, evidenceApprove0);

    const evidenceRemoveReq = hexlify([
      ...Buffer.from("Evidence for remove request"),
    ]);

    // unapproved signer2 requests removal of signer1 account
    await Util.assertError(
      async () =>
        verify
          .connect(signer2)
          .requestRemove(signer1.address, evidenceRemoveReq),
      "ONLY_APPROVED",
      "signer2 requested removal despite not being an approved account"
    );

    // signer2 adds their account and is approved
    const evidenceAdd1 = hexlify([...Buffer.from("Evidence for add")]);
    const evidenceApprove1 = hexlify([...Buffer.from("Evidence for approve")]);

    await verify.connect(signer2).add(evidenceAdd1);
    await verify.connect(approver).approve(signer2.address, evidenceApprove1);

    // signer2 requests removal of signer1 account
    await expect(
      verify.connect(signer2).requestRemove(signer1.address, evidenceRemoveReq)
    )
      .to.emit(verify, "RequestRemove")
      .withArgs(signer2.address, signer1.address, evidenceRemoveReq);
  });

  it("should not grant banner ability to approve or remove if they only have BANNER role", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const defaultAdmin = signers[0];
    // admins
    const aprAdmin = signers[1];
    const rmvAdmin = signers[2];
    const banAdmin = signers[3];
    // verifiers
    const approver = signers[4];
    const remover = signers[5];
    const banner = signers[6];
    // other signers
    const signer1 = signers[7];

    const verify = (await verifyFactory.deploy(defaultAdmin.address)) as Verify;

    // defaultAdmin grants admin roles
    await verify.grantRole(await verify.APPROVER_ADMIN(), aprAdmin.address);
    await verify.grantRole(await verify.REMOVER_ADMIN(), rmvAdmin.address);
    await verify.grantRole(await verify.BANNER_ADMIN(), banAdmin.address);

    // defaultAdmin leaves. This removes a big risk
    await verify.renounceRole(
      await verify.DEFAULT_ADMIN_ROLE(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.APPROVER_ADMIN(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.REMOVER_ADMIN(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.BANNER_ADMIN(),
      defaultAdmin.address
    );

    // admins grant verifiers roles
    await verify
      .connect(aprAdmin)
      .grantRole(await verify.APPROVER(), approver.address);
    await verify
      .connect(rmvAdmin)
      .grantRole(await verify.REMOVER(), remover.address);
    await verify
      .connect(banAdmin)
      .grantRole(await verify.BANNER(), banner.address);

    const evidenceAdd = hexlify([...Buffer.from("Evidence for add")]);
    const evidenceApprove = hexlify([...Buffer.from("Evidence for approve")]);
    const evidenceRemove = hexlify([...Buffer.from("Evidence for remove")]);

    await verify.connect(signer1).add(evidenceAdd);

    await Util.assertError(
      async () =>
        await verify.connect(remover).approve(signer1.address, evidenceApprove),
      "ONLY_APPROVER",
      "non-approver wrongly approved account"
    );

    await Util.assertError(
      async () =>
        await verify.connect(approver).remove(signer1.address, evidenceRemove),
      "ONLY_REMOVER",
      "non-remover wrongly removed account"
    );
  });

  it("should not grant remover ability to approve or ban if they only have REMOVER role", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const defaultAdmin = signers[0];
    // admins
    const aprAdmin = signers[1];
    const rmvAdmin = signers[2];
    const banAdmin = signers[3];
    // verifiers
    const approver = signers[4];
    const remover = signers[5];
    const banner = signers[6];
    // other signers
    const signer1 = signers[7];

    const verify = (await verifyFactory.deploy(defaultAdmin.address)) as Verify;

    // defaultAdmin grants admin roles
    await verify.grantRole(await verify.APPROVER_ADMIN(), aprAdmin.address);
    await verify.grantRole(await verify.REMOVER_ADMIN(), rmvAdmin.address);
    await verify.grantRole(await verify.BANNER_ADMIN(), banAdmin.address);

    // defaultAdmin leaves. This removes a big risk
    await verify.renounceRole(
      await verify.DEFAULT_ADMIN_ROLE(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.APPROVER_ADMIN(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.REMOVER_ADMIN(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.BANNER_ADMIN(),
      defaultAdmin.address
    );

    // admins grant verifiers roles
    await verify
      .connect(aprAdmin)
      .grantRole(await verify.APPROVER(), approver.address);
    await verify
      .connect(rmvAdmin)
      .grantRole(await verify.REMOVER(), remover.address);
    await verify
      .connect(banAdmin)
      .grantRole(await verify.BANNER(), banner.address);

    const evidenceAdd = hexlify([...Buffer.from("Evidence for add")]);
    const evidenceApprove = hexlify([...Buffer.from("Evidence for approve")]);
    const evidenceBan = hexlify([...Buffer.from("Evidence for ban")]);

    await verify.connect(signer1).add(evidenceAdd);

    await Util.assertError(
      async () =>
        await verify.connect(remover).approve(signer1.address, evidenceApprove),
      "ONLY_APPROVER",
      "non-approver wrongly approved account"
    );

    await Util.assertError(
      async () =>
        await verify.connect(approver).ban(signer1.address, evidenceBan),
      "ONLY_BANNER",
      "non-banner wrongly banned session"
    );
  });

  it("should not grant approver ability to remove or ban if they only have APPROVER role", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const defaultAdmin = signers[0];
    // admins
    const aprAdmin = signers[1];
    const rmvAdmin = signers[2];
    const banAdmin = signers[3];
    // verifiers
    const approver = signers[4];
    const remover = signers[5];
    const banner = signers[6];
    // other signers
    const signer1 = signers[7];

    const verify = (await verifyFactory.deploy(defaultAdmin.address)) as Verify;

    // defaultAdmin grants admin roles
    await verify.grantRole(await verify.APPROVER_ADMIN(), aprAdmin.address);
    await verify.grantRole(await verify.REMOVER_ADMIN(), rmvAdmin.address);
    await verify.grantRole(await verify.BANNER_ADMIN(), banAdmin.address);

    // defaultAdmin leaves. This removes a big risk
    await verify.renounceRole(
      await verify.DEFAULT_ADMIN_ROLE(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.APPROVER_ADMIN(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.REMOVER_ADMIN(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.BANNER_ADMIN(),
      defaultAdmin.address
    );

    // admins grant verifiers roles
    await verify
      .connect(aprAdmin)
      .grantRole(await verify.APPROVER(), approver.address);
    await verify
      .connect(rmvAdmin)
      .grantRole(await verify.REMOVER(), remover.address);
    await verify
      .connect(banAdmin)
      .grantRole(await verify.BANNER(), banner.address);

    const evidenceAdd = hexlify([...Buffer.from("Evidence for add")]);
    const evidenceRemove = hexlify([...Buffer.from("Evidence for remove")]);
    const evidenceBan = hexlify([...Buffer.from("Evidence for ban")]);

    await verify.connect(signer1).add(evidenceAdd);

    await Util.assertError(
      async () =>
        await verify.connect(approver).remove(signer1.address, evidenceRemove),
      "ONLY_REMOVER",
      "non-remover wrongly removed account"
    );

    await Util.assertError(
      async () =>
        await verify.connect(approver).ban(signer1.address, evidenceBan),
      "ONLY_BANNER",
      "non-banner wrongly banned session"
    );
  });

  it("should allow admins to grant others the same admin role", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const defaultAdmin = signers[0];
    const aprAdmin0 = signers[1];
    const rmvAdmin0 = signers[2];
    const banAdmin0 = signers[3];
    const aprAdmin1 = signers[4];
    const rmvAdmin1 = signers[5];
    const banAdmin1 = signers[6];

    const verify = (await verifyFactory.deploy(defaultAdmin.address)) as Verify;

    await verify.grantRole(await verify.APPROVER_ADMIN(), aprAdmin0.address);
    await verify.grantRole(await verify.REMOVER_ADMIN(), rmvAdmin0.address);
    await verify.grantRole(await verify.BANNER_ADMIN(), banAdmin0.address);

    // defaultAdmin leaves. This removes a big risk
    await verify.renounceRole(
      await verify.DEFAULT_ADMIN_ROLE(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.APPROVER_ADMIN(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.REMOVER_ADMIN(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.BANNER_ADMIN(),
      defaultAdmin.address
    );

    await verify
      .connect(aprAdmin0)
      .grantRole(await verify.APPROVER_ADMIN(), aprAdmin1.address);
    await verify
      .connect(rmvAdmin0)
      .grantRole(await verify.REMOVER_ADMIN(), rmvAdmin1.address);
    await verify
      .connect(banAdmin0)
      .grantRole(await verify.BANNER_ADMIN(), banAdmin1.address);
  });

  it("should allow admin to delegate admin roles and then renounce DEFAULT_ADMIN_ROLE", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const defaultAdmin = signers[0];
    const aprAdmin0 = signers[1];
    const rmvAdmin0 = signers[2];
    const banAdmin0 = signers[3];
    const aprAdmin1 = signers[4];
    const rmvAdmin1 = signers[5];
    const banAdmin1 = signers[6];

    const verify = (await verifyFactory.deploy(defaultAdmin.address)) as Verify;

    await verify.grantRole(await verify.APPROVER_ADMIN(), aprAdmin0.address);
    await verify.grantRole(await verify.REMOVER_ADMIN(), rmvAdmin0.address);
    await verify.grantRole(await verify.BANNER_ADMIN(), banAdmin0.address);

    // defaultAdmin leaves. This removes a big risk
    await verify.renounceRole(
      await verify.DEFAULT_ADMIN_ROLE(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.APPROVER_ADMIN(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.REMOVER_ADMIN(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.BANNER_ADMIN(),
      defaultAdmin.address
    );
    const hasRoleDefaultAdmin = await verify.hasRole(
      await verify.DEFAULT_ADMIN_ROLE(),
      defaultAdmin.address
    );
    const hasRoleApproverAdmin = await verify.hasRole(
      await verify.APPROVER_ADMIN(),
      defaultAdmin.address
    );
    const hasRoleRemoverAdmin = await verify.hasRole(
      await verify.REMOVER_ADMIN(),
      defaultAdmin.address
    );
    const hasRoleBannerAdmin = await verify.hasRole(
      await verify.BANNER_ADMIN(),
      defaultAdmin.address
    );
    assert(
      !hasRoleDefaultAdmin,
      "default admin didn't renounce default admin role"
    );
    assert(
      !hasRoleApproverAdmin,
      "default admin didn't renounce approver admin role"
    );
    assert(
      !hasRoleRemoverAdmin,
      "default admin didn't renounce remover admin role"
    );
    assert(
      !hasRoleBannerAdmin,
      "default admin didn't renounce banner admin role"
    );

    await Util.assertError(
      async () =>
        await verify.grantRole(
          await verify.APPROVER_ADMIN(),
          aprAdmin1.address
        ),
      "is missing role",
      "default admin wrongly granted approver admin role after renouncing default admin role"
    );
    await Util.assertError(
      async () =>
        await verify.grantRole(await verify.REMOVER_ADMIN(), rmvAdmin1.address),
      "is missing role",
      "default admin wrongly granted remover admin role after renouncing default admin role"
    );
    await Util.assertError(
      async () =>
        await verify.grantRole(await verify.BANNER_ADMIN(), banAdmin1.address),
      "is missing role",
      "default admin wrongly granted banner admin role after renouncing default admin role"
    );
  });

  it("should allow admin to delegate admin roles which can then grant non-admin roles", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const defaultAdmin = signers[0];
    // admins
    const aprAdmin = signers[1];
    const rmvAdmin = signers[2];
    const banAdmin = signers[3];
    // verifiers
    const approver = signers[4];
    const remover = signers[5];
    const banner = signers[6];

    const verify = (await verifyFactory.deploy(defaultAdmin.address)) as Verify;

    // defaultAdmin grants admin roles
    await verify.grantRole(await verify.APPROVER_ADMIN(), aprAdmin.address);
    await verify.grantRole(await verify.REMOVER_ADMIN(), rmvAdmin.address);
    await verify.grantRole(await verify.BANNER_ADMIN(), banAdmin.address);

    // defaultAdmin leaves. This removes a big risk
    await verify.renounceRole(
      await verify.DEFAULT_ADMIN_ROLE(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.APPROVER_ADMIN(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.REMOVER_ADMIN(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.BANNER_ADMIN(),
      defaultAdmin.address
    );

    // admins grant verifiers roles
    await verify
      .connect(aprAdmin)
      .grantRole(await verify.APPROVER(), approver.address);
    await verify
      .connect(rmvAdmin)
      .grantRole(await verify.REMOVER(), remover.address);
    await verify
      .connect(banAdmin)
      .grantRole(await verify.BANNER(), banner.address);
  });

  it("statusAtBlock should return correct status for any given state & block number", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const defaultAdmin = signers[0];
    // admins
    const aprAdmin = signers[1];
    const rmvAdmin = signers[2];
    const banAdmin = signers[3];
    // verifiers
    const approver = signers[4];
    const remover = signers[5];
    const banner = signers[6];
    // other signers
    const signer1 = signers[7];

    const verify = (await verifyFactory.deploy(defaultAdmin.address)) as Verify;

    // defaultAdmin grants admin roles
    await verify.grantRole(await verify.APPROVER_ADMIN(), aprAdmin.address);
    await verify.grantRole(await verify.REMOVER_ADMIN(), rmvAdmin.address);
    await verify.grantRole(await verify.BANNER_ADMIN(), banAdmin.address);

    const state0 = await verify.state(signer1.address);
    assert(
      (await verify.statusAtBlock(
        state0,
        await ethers.provider.getBlockNumber()
      )) === Status.Nil,
      "status should be Nil"
    );

    // defaultAdmin leaves. This removes a big risk
    await verify.renounceRole(
      await verify.DEFAULT_ADMIN_ROLE(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.APPROVER_ADMIN(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.REMOVER_ADMIN(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.BANNER_ADMIN(),
      defaultAdmin.address
    );

    // admins grant verifiers roles
    await verify
      .connect(aprAdmin)
      .grantRole(await verify.APPROVER(), approver.address);
    await verify
      .connect(rmvAdmin)
      .grantRole(await verify.REMOVER(), remover.address);
    await verify
      .connect(banAdmin)
      .grantRole(await verify.BANNER(), banner.address);

    const blockBeforeAdd = await ethers.provider.getBlockNumber();

    const evidenceAdd = hexlify([...Buffer.from("Evidence for add")]);
    const evidenceApprove = hexlify([...Buffer.from("Evidence for approve")]);
    const evidenceBan = hexlify([...Buffer.from("Evidence for ban")]);
    const evidenceRemove = hexlify([...Buffer.from("Evidence for remove")]);

    await verify.connect(signer1).add(evidenceAdd);

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
    await verify.connect(approver).approve(signer1.address, evidenceApprove);

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
    await verify.connect(banner).ban(signer1.address, evidenceBan);

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
    await verify.connect(remover).remove(signer1.address, evidenceRemove);

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
    const defaultAdmin = signers[0];
    // admins
    const aprAdmin = signers[1];
    const rmvAdmin = signers[2];
    const banAdmin = signers[3];
    // verifiers
    const approver = signers[4];
    const remover = signers[5];
    const banner = signers[6];
    // other signers
    const signer1 = signers[7];

    const verify = (await verifyFactory.deploy(defaultAdmin.address)) as Verify;

    // defaultAdmin grants admin roles
    await verify.grantRole(await verify.APPROVER_ADMIN(), aprAdmin.address);
    await verify.grantRole(await verify.REMOVER_ADMIN(), rmvAdmin.address);
    await verify.grantRole(await verify.BANNER_ADMIN(), banAdmin.address);

    // defaultAdmin leaves. This removes a big risk
    await verify.renounceRole(
      await verify.APPROVER_ADMIN(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.REMOVER_ADMIN(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.BANNER_ADMIN(),
      defaultAdmin.address
    );

    // admins grant verifiers roles
    await verify
      .connect(aprAdmin)
      .grantRole(await verify.APPROVER(), approver.address);
    await verify
      .connect(rmvAdmin)
      .grantRole(await verify.REMOVER(), remover.address);
    await verify
      .connect(banAdmin)
      .grantRole(await verify.BANNER(), banner.address);

    const evidenceAdd = hexlify([...Buffer.from("Evidence for add")]);
    const evidenceApprove = hexlify([...Buffer.from("Evidence for approve")]);
    const evidenceBan = hexlify([...Buffer.from("Evidence for ban")]);
    const evidenceRemove = hexlify([...Buffer.from("Evidence for remove")]);

    await Util.assertError(
      async () =>
        await verify
          .connect(approver)
          .approve(signer1.address, evidenceApprove),
      "NOT_ADDED",
      "wrongly approved when Status equals Nil"
    );
    await Util.assertError(
      async () =>
        await verify.connect(banner).ban(signer1.address, evidenceBan),
      "NOT_ADDED",
      "wrongly banned when Status equals Nil"
    );

    // Add
    await verify.connect(signer1).add(evidenceAdd);

    // Approve
    await verify.connect(approver).approve(signer1.address, evidenceApprove);

    await Util.assertError(
      async () =>
        await verify
          .connect(approver)
          .approve(signer1.address, evidenceApprove),
      "PRIOR_APPROVE",
      "wrongly approved when Status equals Approved"
    );

    // Ban
    await verify.connect(banner).ban(signer1.address, evidenceBan);

    await Util.assertError(
      async () =>
        await verify
          .connect(approver)
          .approve(signer1.address, evidenceApprove),
      "PRIOR_APPROVE",
      "wrongly approved when Status equals Banned"
    );
    await Util.assertError(
      async () =>
        await verify.connect(banner).ban(signer1.address, evidenceBan),
      "PRIOR_BAN",
      "wrongly banned when Status equals Banned"
    );

    // Remove
    await verify.connect(remover).remove(signer1.address, evidenceRemove);
  });

  it("should require non-zero admin address", async function () {
    this.timeout(0);

    await Util.assertError(
      async () => await verifyFactory.deploy(Util.zeroAddress),
      "0_ACCOUNT",
      "wrongly constructed Verify with admin as zero address"
    );
  });

  it("should return correct state for a given account", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const defaultAdmin = signers[0];
    // admins
    const aprAdmin = signers[1];
    const rmvAdmin = signers[2];
    const banAdmin = signers[3];
    // verifiers
    const approver = signers[4];
    const remover = signers[5];
    const banner = signers[6];
    // other signers
    const signer1 = signers[7];

    const verify = (await verifyFactory.deploy(defaultAdmin.address)) as Verify;

    // defaultAdmin grants admin roles
    await verify.grantRole(await verify.APPROVER_ADMIN(), aprAdmin.address);
    await verify.grantRole(await verify.REMOVER_ADMIN(), rmvAdmin.address);
    await verify.grantRole(await verify.BANNER_ADMIN(), banAdmin.address);

    // defaultAdmin leaves. This removes a big risk
    await verify.renounceRole(
      await verify.DEFAULT_ADMIN_ROLE(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.APPROVER_ADMIN(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.REMOVER_ADMIN(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.BANNER_ADMIN(),
      defaultAdmin.address
    );

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

    // admins grant verifiers roles
    await verify
      .connect(aprAdmin)
      .grantRole(await verify.APPROVER(), approver.address);
    await verify
      .connect(rmvAdmin)
      .grantRole(await verify.REMOVER(), remover.address);
    await verify
      .connect(banAdmin)
      .grantRole(await verify.BANNER(), banner.address);

    const evidenceAdd = hexlify([...Buffer.from("Evidence for add")]);
    const evidenceApprove = hexlify([...Buffer.from("Evidence for approve")]);
    const evidenceBan = hexlify([...Buffer.from("Evidence for ban")]);
    const evidenceRemove = hexlify([...Buffer.from("Evidence for remove")]);

    await verify.connect(signer1).add(evidenceAdd);

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
    await verify.connect(approver).approve(signer1.address, evidenceApprove);

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
    await verify.connect(banner).ban(signer1.address, evidenceBan);

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
    await verify.connect(remover).remove(signer1.address, evidenceRemove);

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
    const defaultAdmin = signers[0];

    const verify = (await verifyFactory.deploy(defaultAdmin.address)) as Verify;

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

  it("should allow anyone to submit data to support verification", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const defaultAdmin = signers[0];
    const signer1 = signers[1];
    const signer2 = signers[2];

    const verify = (await verifyFactory.deploy(defaultAdmin.address)) as Verify;

    const evidenceAdd = hexlify([...Buffer.from("Evidence for add")]);

    // signer1 submits evidence
    await expect(verify.connect(signer1).add(evidenceAdd))
      .to.emit(verify, "RequestApprove")
      .withArgs(signer1.address, evidenceAdd);

    const state0 = await verify.state(signer1.address);

    // signer1 cannot overwrite previous submission
    await Util.assertError(
      async () => await verify.connect(signer1).add(evidenceAdd),
      "PRIOR_ADD",
      "signer1 wiped their own state"
    );

    // another signer should be able to submit identical evidence
    await verify.connect(signer2).add(evidenceAdd);

    // signer2 adding should not wipe state for signer1
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

  it("should allow only approver to approve accounts", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const defaultAdmin = signers[0];
    const aprAdmin = signers[1];
    const signer1 = signers[2];
    const approver = signers[3];
    const nonApprover = signers[4];

    const verify = (await verifyFactory.deploy(defaultAdmin.address)) as Verify;

    // defaultAdmin grants admin role
    await verify.grantRole(await verify.APPROVER_ADMIN(), aprAdmin.address);

    // defaultAdmin leaves. This removes a big risk
    await verify.renounceRole(
      await verify.DEFAULT_ADMIN_ROLE(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.APPROVER_ADMIN(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.REMOVER_ADMIN(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.BANNER_ADMIN(),
      defaultAdmin.address
    );

    // approver admin grants approver role
    await verify
      .connect(aprAdmin)
      .grantRole(await verify.APPROVER(), approver.address);

    const evidenceAdd = hexlify([...Buffer.from("Evidence for add")]);
    const evidenceApprove = hexlify([...Buffer.from("Evidence for approve")]);

    await verify.connect(signer1).add(evidenceAdd);

    // prevent approving zero address
    await Util.assertError(
      async () =>
        await verify
          .connect(approver)
          .approve(Util.zeroAddress, evidenceApprove),
      "0_ADDRESS",
      "wrongly approved account with address of 0"
    );

    await Util.assertError(
      async () =>
        await verify
          .connect(nonApprover)
          .approve(signer1.address, evidenceApprove),
      "ONLY_APPROVER",
      "non-approver wrongly approved account"
    );

    // approve account
    await expect(
      verify.connect(approver).approve(signer1.address, evidenceApprove)
    )
      .to.emit(verify, "Approve")
      .withArgs(approver.address, signer1.address, evidenceApprove);

    // check that signer1 has been approved
    const stateApproved = await verify.state(signer1.address);
    assert(
      stateApproved.approvedSince === (await ethers.provider.getBlockNumber()),
      "not approved"
    );
  });

  it("should allow only remover to remove accounts", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const defaultAdmin = signers[0];
    const rmvAdmin = signers[1];
    const signer1 = signers[2];
    const remover = signers[3];
    const nonRemover = signers[4];

    const verify = (await verifyFactory.deploy(defaultAdmin.address)) as Verify;

    // defaultAdmin grants admin role
    await verify.grantRole(await verify.REMOVER_ADMIN(), rmvAdmin.address);

    // defaultAdmin leaves. This removes a big risk
    await verify.renounceRole(
      await verify.DEFAULT_ADMIN_ROLE(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.APPROVER_ADMIN(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.REMOVER_ADMIN(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.BANNER_ADMIN(),
      defaultAdmin.address
    );

    // remover admin grants remover role
    await verify
      .connect(rmvAdmin)
      .grantRole(await verify.REMOVER(), remover.address);

    const evidenceAdd = hexlify([...Buffer.from("Evidence for add")]);
    const evidenceRemove = hexlify([...Buffer.from("Evidence for remove")]);

    await verify.connect(signer1).add(evidenceAdd);

    // prevent removing account of address 0
    await Util.assertError(
      async () =>
        await verify.connect(remover).remove(Util.zeroAddress, evidenceRemove),
      "0_ADDRESS",
      "wrongly removed account with address of 0"
    );

    await Util.assertError(
      async () =>
        await verify
          .connect(nonRemover)
          .remove(signer1.address, evidenceRemove),
      "ONLY_REMOVER",
      "non-remover wrongly removed account"
    );

    // admin removes account
    await expect(
      verify.connect(remover).remove(signer1.address, evidenceRemove)
    )
      .to.emit(verify, "Remove")
      .withArgs(remover.address, signer1.address, evidenceRemove);

    // check that signer1 has been removed
    const stateRemoved = await verify.state(signer1.address);
    assert(stateRemoved.addedSince === 0, "not removed");
    assert(stateRemoved.approvedSince === 0, "not removed");
    assert(stateRemoved.bannedSince === 0, "not removed");
  });

  it("should allow only banner to ban sessions", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const defaultAdmin = signers[0];
    const banAdmin = signers[1];
    const signer1 = signers[2];
    const banner = signers[3];
    const nonBanner = signers[4];

    const verify = (await verifyFactory.deploy(defaultAdmin.address)) as Verify;

    // defaultAdmin grants admin role
    await verify.grantRole(await verify.BANNER_ADMIN(), banAdmin.address);

    // defaultAdmin leaves. This removes a big risk
    await verify.renounceRole(
      await verify.DEFAULT_ADMIN_ROLE(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.APPROVER_ADMIN(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.REMOVER_ADMIN(),
      defaultAdmin.address
    );
    await verify.renounceRole(
      await verify.BANNER_ADMIN(),
      defaultAdmin.address
    );

    // banner admin grants banner role
    await verify
      .connect(banAdmin)
      .grantRole(await verify.BANNER(), banner.address);

    const evidenceAdd = hexlify([...Buffer.from("Evidence for add")]);
    const evidenceBan = hexlify([...Buffer.from("Evidence for ban")]);

    await verify.connect(signer1).add(evidenceAdd);

    // prevent banning zero address
    await Util.assertError(
      async () =>
        await verify.connect(banner).ban(Util.zeroAddress, evidenceBan),
      "0_ADDRESS",
      "wrongly banning zero address"
    );

    await Util.assertError(
      async () =>
        await verify.connect(nonBanner).ban(signer1.address, evidenceBan),
      "ONLY_BANNER",
      "non-banner wrongly banned session"
    );

    // admin bans account
    await expect(verify.connect(banner).ban(signer1.address, evidenceBan))
      .to.emit(verify, "Ban")
      .withArgs(banner.address, signer1.address, evidenceBan);

    // check that signer1 has been banned
    const stateBanned = await verify.state(signer1.address);
    assert(
      stateBanned.bannedSince === (await ethers.provider.getBlockNumber()),
      "not banned"
    );
  });
});
