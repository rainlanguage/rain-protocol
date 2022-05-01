import * as Util from "../Util";
import chai from "chai";
import { ethers } from "hardhat";
import type {
  ApproveEvent,
  BanEvent,
  RemoveEvent,
  RequestApproveEvent,
  RequestBanEvent,
  RequestRemoveEvent,
  Verify,
} from "../../typechain/Verify";
import type { VerifyCallbackTest } from "../../typechain/VerifyCallbackTest";
import { max_uint32 } from "../Util";
import { hexlify } from "ethers/lib/utils";

const { assert } = chai;

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

describe("Verify", async function () {
  it("should trigger verify callback contract hooks after adding, approving, banning and removing", async function () {
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
    const signer2 = signers[8];

    const verifyCallback = (await Util.basicDeploy(
      "VerifyCallbackTest",
      {}
    )) as VerifyCallbackTest;

    const verify = (await Util.verifyDeploy(signers[0], {
      admin: defaultAdmin.address,
      callback: verifyCallback.address,
    })) as Verify;

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

    const badEvidenceAdd = hexlify([...Buffer.from("Bad")]);
    const badEvidenceApprove = hexlify([...Buffer.from("Bad")]);
    const badEvidenceBan = hexlify([...Buffer.from("Bad")]);
    const badEvidenceRemove = hexlify([...Buffer.from("Bad")]);

    const goodEvidenceAdd = hexlify([...Buffer.from("Good")]);
    const goodEvidenceApprove = hexlify([...Buffer.from("Good")]);
    const goodEvidenceBan = hexlify([...Buffer.from("Good")]);
    const goodEvidenceRemove = hexlify([...Buffer.from("Good")]);

    // add account
    await Util.assertError(
      async () => await verify.connect(signer1).add(badEvidenceAdd),
      "BAD_EVIDENCE",
      "afterAdd hook did not require Good evidence"
    );
    await verify.connect(signer1).add(goodEvidenceAdd);
    await Util.assertError(
      async () => await verify.connect(signer1).add(goodEvidenceAdd),
      "PRIOR_ADD",
      "afterAdd hook did not prevent 2nd add"
    );

    // approve account
    await Util.assertError(
      async () =>
        await verify
          .connect(approver)
          .approve([{ account: signer1.address, data: badEvidenceApprove }]),
      "BAD_EVIDENCE",
      "afterApprove hook did not require Good evidence"
    );
    assert(
      !(await verifyCallback.approvals(signer1.address)),
      "approved with bad evidence"
    );

    await verify
      .connect(approver)
      .approve([{ account: signer1.address, data: goodEvidenceApprove }]);
    assert(
      await verifyCallback.approvals(signer1.address),
      "did not approve with good evidence"
    );

    await verify.connect(approver).approve([
      // Include signer1 a second time. The test contract will throw an error
      // if it sees the same approval twice. This shows the Verify contract
      // filters out dupes.
      { account: signer1.address, data: goodEvidenceApprove },
      // The signer2 should be approved and not filtered out by the Verify
      // contract.
      { account: signer2.address, data: goodEvidenceApprove },
    ]);
    assert(
      await verifyCallback.approvals(signer1.address),
      "missing signer 1 approval"
    );
    assert(
      await verifyCallback.approvals(signer2.address),
      "did not approve signer2 with good evidence"
    );

    // ban account
    await Util.assertError(
      async () =>
        await verify
          .connect(banner)
          .ban([{ account: signer1.address, data: badEvidenceBan }]),
      "BAD_EVIDENCE",
      "afterBan hook did not require Good evidence"
    );
    assert(
      !(await verifyCallback.bans(signer1.address)),
      "banned signer1 without good evidence"
    );
    await verify
      .connect(banner)
      .ban([{ account: signer1.address, data: goodEvidenceBan }]);
    assert(
      await verifyCallback.bans(signer1.address),
      "did not ban signer1 with good evidence"
    );
    await verify.connect(banner).ban([
      // Include signer1 a second time. The test contract will throw an error
      // if it sees the same ban twice. This shows the Verify contract filters
      // out dupes.
      { account: signer1.address, data: goodEvidenceBan },
      // The signer2 should be banned and not filtered out by the Verify
      // contract.
      { account: signer2.address, data: goodEvidenceBan },
    ]);
    assert(await verifyCallback.bans(signer1.address), "missing signer 1 ban");
    assert(
      await verifyCallback.bans(signer2.address),
      "did not ban signer2 with good evidence"
    );

    // remove account
    await Util.assertError(
      async () =>
        await verify
          .connect(remover)
          .remove([{ account: signer1.address, data: badEvidenceRemove }]),
      "BAD_EVIDENCE",
      "afterRemove hook did not require Good evidence"
    );
    assert(
      !(await verifyCallback.removals(signer1.address)),
      "removed signer1 with bad evidence"
    );
    await verify
      .connect(remover)
      .remove([{ account: signer1.address, data: goodEvidenceRemove }]);
    assert(
      await verifyCallback.removals(signer1.address),
      "did not remove signer1 with good evidence"
    );
    await verify.connect(remover).remove([
      // include signer1 against to ensure that Verify filters dupes and does
      // not cause the test contract to error.
      { account: signer1.address, data: goodEvidenceRemove },
      // remove signer 2 also.
      { account: signer2.address, data: goodEvidenceRemove },
    ]);
    assert(
      await verifyCallback.removals(signer1.address),
      "missing removal of signer1"
    );
    assert(
      await verifyCallback.removals(signer2.address),
      "did not remove signer2 with good evidence"
    );
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

    const verify = (await Util.verifyDeploy(signers[0], {
      admin: defaultAdmin.address,
      callback: ethers.constants.AddressZero,
    })) as Verify;

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

    // signer1 adds their account and is approved
    const evidenceAdd0 = hexlify([...Buffer.from("Evidence for add")]);
    const evidenceApprove0 = hexlify([...Buffer.from("Evidence for approve")]);

    await verify.connect(signer1).add(evidenceAdd0);
    await verify
      .connect(approver)
      .approve([{ account: signer1.address, data: evidenceApprove0 }]);

    const evidenceBanReq = hexlify([
      ...Buffer.from("Evidence for ban request"),
    ]);

    // unapproved signer2 requests ban of signer1 account
    await Util.assertError(
      async () =>
        verify
          .connect(signer2)
          .requestBan([{ account: signer1.address, data: evidenceBanReq }]),
      "ONLY_APPROVED",
      "signer2 requested ban despite not being an approved account"
    );

    // signer2 adds their account and is approved
    const evidenceAdd1 = hexlify([...Buffer.from("Evidence for add")]);
    const evidenceApprove1 = hexlify([...Buffer.from("Evidence for approve")]);

    await verify.connect(signer2).add(evidenceAdd1);
    await verify
      .connect(approver)
      .approve([{ account: signer2.address, data: evidenceApprove1 }]);

    // signer2 requests ban of signer1 account
    const event0 = (await Util.getEventArgs(
      await verify
        .connect(signer2)
        .requestBan([{ account: signer1.address, data: evidenceBanReq }]),
      "RequestBan",
      verify
    )) as RequestBanEvent["args"];
    assert(event0.sender === signer2.address, "wrong sender in event0");
    assert(
      event0.evidence.account === signer1.address,
      "wrong account in event0"
    );
    assert(event0.evidence.data === evidenceBanReq, "wrong data in event0");
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

    const verify = (await Util.verifyDeploy(signers[0], {
      admin: defaultAdmin.address,
      callback: ethers.constants.AddressZero,
    })) as Verify;

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

    // signer1 adds their account and is approved
    const evidenceAdd0 = hexlify([...Buffer.from("Evidence for add")]);
    const evidenceApprove0 = hexlify([...Buffer.from("Evidence for approve")]);

    await verify.connect(signer1).add(evidenceAdd0);
    await verify
      .connect(approver)
      .approve([{ account: signer1.address, data: evidenceApprove0 }]);

    const evidenceRemoveReq = hexlify([
      ...Buffer.from("Evidence for remove request"),
    ]);

    // unapproved signer2 requests removal of signer1 account
    await Util.assertError(
      async () =>
        verify
          .connect(signer2)
          .requestRemove([
            { account: signer1.address, data: evidenceRemoveReq },
          ]),
      "ONLY_APPROVED",
      "signer2 requested removal despite not being an approved account"
    );

    // signer2 adds their account and is approved
    const evidenceAdd1 = hexlify([...Buffer.from("Evidence for add")]);
    const evidenceApprove1 = hexlify([...Buffer.from("Evidence for approve")]);

    await verify.connect(signer2).add(evidenceAdd1);
    await verify
      .connect(approver)
      .approve([{ account: signer2.address, data: evidenceApprove1 }]);

    // signer2 requests removal of signer1 account
    const event0 = (await Util.getEventArgs(
      await verify
        .connect(signer2)
        .requestRemove([{ account: signer1.address, data: evidenceRemoveReq }]),
      "RequestRemove",
      verify
    )) as RequestRemoveEvent["args"];
    assert(event0.sender === signer2.address, "wrong sender in event0");
    assert(
      event0.evidence.account === signer1.address,
      "wrong account in event0"
    );
    assert(event0.evidence.data === evidenceRemoveReq, "wrong data in event0");
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

    const verify = (await Util.verifyDeploy(signers[0], {
      admin: defaultAdmin.address,
      callback: ethers.constants.AddressZero,
    })) as Verify;

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
    const evidenceRemove = hexlify([...Buffer.from("Evidence for remove")]);

    await verify.connect(signer1).add(evidenceAdd);

    await Util.assertError(
      async () =>
        await verify
          .connect(remover)
          .approve([{ account: signer1.address, data: evidenceApprove }]),
      `AccessControl: account ${remover.address.toLowerCase()} is missing role ${await verify.APPROVER()}`,
      "non-approver wrongly approved account"
    );

    await Util.assertError(
      async () =>
        await verify
          .connect(approver)
          .remove([{ account: signer1.address, data: evidenceRemove }]),
      `AccessControl: account ${approver.address.toLowerCase()} is missing role ${await verify.REMOVER()}`,
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

    const verify = (await Util.verifyDeploy(signers[0], {
      admin: defaultAdmin.address,
      callback: ethers.constants.AddressZero,
    })) as Verify;

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

    await verify.connect(signer1).add(evidenceAdd);

    await Util.assertError(
      async () =>
        await verify
          .connect(remover)
          .approve([{ account: signer1.address, data: evidenceApprove }]),
      `AccessControl: account ${remover.address.toLowerCase()} is missing role ${await verify.APPROVER()}`,
      "non-approver wrongly approved account"
    );

    await Util.assertError(
      async () =>
        await verify
          .connect(approver)
          .ban([{ account: signer1.address, data: evidenceBan }]),
      `AccessControl: account ${approver.address.toLowerCase()} is missing role ${await verify.BANNER()}`,
      "non-banner wrongly banned account"
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

    const verify = (await Util.verifyDeploy(signers[0], {
      admin: defaultAdmin.address,
      callback: ethers.constants.AddressZero,
    })) as Verify;

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
    const evidenceRemove = hexlify([...Buffer.from("Evidence for remove")]);
    const evidenceBan = hexlify([...Buffer.from("Evidence for ban")]);

    await verify.connect(signer1).add(evidenceAdd);

    await Util.assertError(
      async () =>
        await verify
          .connect(approver)
          .remove([{ account: signer1.address, data: evidenceRemove }]),
      `AccessControl: account ${approver.address.toLowerCase()} is missing role ${await verify.REMOVER()}`,
      "non-remover wrongly removed account"
    );

    await Util.assertError(
      async () =>
        await verify
          .connect(approver)
          .ban([{ account: signer1.address, data: evidenceBan }]),
      `AccessControl: account ${approver.address.toLowerCase()} is missing role ${await verify.BANNER()}`,
      "non-banner wrongly banned account"
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

    const verify = (await Util.verifyDeploy(signers[0], {
      admin: defaultAdmin.address,
      callback: ethers.constants.AddressZero,
    })) as Verify;

    await verify.grantRole(await verify.APPROVER_ADMIN(), aprAdmin0.address);
    await verify.grantRole(await verify.REMOVER_ADMIN(), rmvAdmin0.address);
    await verify.grantRole(await verify.BANNER_ADMIN(), banAdmin0.address);

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

  it("should allow admin to delegate admin roles and then renounce them", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const defaultAdmin = signers[0];
    const aprAdmin0 = signers[1];
    const rmvAdmin0 = signers[2];
    const banAdmin0 = signers[3];
    const aprAdmin1 = signers[4];
    const rmvAdmin1 = signers[5];
    const banAdmin1 = signers[6];

    const verify = (await Util.verifyDeploy(signers[0], {
      admin: defaultAdmin.address,
      callback: ethers.constants.AddressZero,
    })) as Verify;

    await verify.grantRole(await verify.APPROVER_ADMIN(), aprAdmin0.address);
    await verify.grantRole(await verify.REMOVER_ADMIN(), rmvAdmin0.address);
    await verify.grantRole(await verify.BANNER_ADMIN(), banAdmin0.address);

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

    const verify = (await Util.verifyDeploy(signers[0], {
      admin: defaultAdmin.address,
      callback: ethers.constants.AddressZero,
    })) as Verify;

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

    const verify = (await Util.verifyDeploy(signers[0], {
      admin: defaultAdmin.address,
      callback: ethers.constants.AddressZero,
    })) as Verify;

    // defaultAdmin grants admin roles
    await verify.grantRole(await verify.APPROVER_ADMIN(), aprAdmin.address);
    await verify.grantRole(await verify.REMOVER_ADMIN(), rmvAdmin.address);
    await verify.grantRole(await verify.BANNER_ADMIN(), banAdmin.address);

    const state0 = await verify.state(signer1.address);
    assert(
      (
        await verify.statusAtBlock(
          state0,
          await ethers.provider.getBlockNumber()
        )
      ).eq(Status.Nil),
      "status should be Nil"
    );

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

    const blockBeforeAdd = await ethers.provider.getBlockNumber();

    const evidenceAdd = hexlify([...Buffer.from("Evidence for add")]);
    const evidenceApprove = hexlify([...Buffer.from("Evidence for approve")]);
    const evidenceBan = hexlify([...Buffer.from("Evidence for ban")]);
    const evidenceRemove = hexlify([...Buffer.from("Evidence for remove")]);

    await verify.connect(signer1).add(evidenceAdd);

    const state1 = await verify.state(signer1.address);
    assert(
      (
        await verify.statusAtBlock(
          state1,
          await ethers.provider.getBlockNumber()
        )
      ).eq(Status.Added),
      "status should be Added"
    );

    const blockBeforeApprove = await ethers.provider.getBlockNumber();

    // approve account
    await verify
      .connect(approver)
      .approve([{ account: signer1.address, data: evidenceApprove }]);

    const state2 = await verify.state(signer1.address);
    assert(
      (
        await verify.statusAtBlock(
          state2,
          await ethers.provider.getBlockNumber()
        )
      ).eq(Status.Approved),
      "status should be Approved"
    );

    const blockBeforeBan = await ethers.provider.getBlockNumber();

    // ban account
    await verify
      .connect(banner)
      .ban([{ account: signer1.address, data: evidenceBan }]);

    const state3 = await verify.state(signer1.address);
    assert(
      (
        await verify.statusAtBlock(
          state3,
          await ethers.provider.getBlockNumber()
        )
      ).eq(Status.Banned),
      "status should be Banned"
    );

    // interrogate history using latest state, before being cleared with `.remove()`
    assert(
      (await verify.statusAtBlock(state3, blockBeforeAdd)).eq(Status.Nil),
      "status should be Nil before add"
    );
    assert(
      (await verify.statusAtBlock(state3, blockBeforeApprove)).eq(Status.Added),
      "status should be Added before approve"
    );
    assert(
      (await verify.statusAtBlock(state3, blockBeforeBan)).eq(Status.Approved),
      "status should be Approved before ban"
    );

    // remove account
    await verify
      .connect(remover)
      .remove([{ account: signer1.address, data: evidenceRemove }]);

    const state4 = await verify.state(signer1.address);
    assert(
      (
        await verify.statusAtBlock(
          state4,
          await ethers.provider.getBlockNumber()
        )
      ).eq(Status.Nil),
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

    const verify = (await Util.verifyDeploy(signers[0], {
      admin: defaultAdmin.address,
      callback: ethers.constants.AddressZero,
    })) as Verify;

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

    // Add
    await verify.connect(signer1).add(evidenceAdd);

    // Approve
    await verify
      .connect(approver)
      .approve([{ account: signer1.address, data: evidenceApprove }]);

    // Calling approve() again succeeds but does not update approval block.
    // This could occur with multiple approvers operating concurrently and independently.
    const reApproveTx = await verify
      .connect(approver)
      .approve([{ account: signer1.address, data: evidenceApprove }]);

    const { sender, evidence } = (await Util.getEventArgs(
      reApproveTx,
      "Approve",
      verify
    )) as ApproveEvent["args"];
    assert(sender === approver.address, "wrong sender in reapprove event");
    assert(
      evidence.account === signer1.address,
      "wrong account in reapprove event"
    );
    assert(evidence.data === evidenceApprove, "wrong data in reapprove event");

    // Ban
    await verify
      .connect(banner)
      .ban([{ account: signer1.address, data: evidenceBan }]);

    // Calling ban() again succeeds but does not update approval block.
    // This could occur with multiple approvers operating concurrently and independently.
    const reBanTx = await verify
      .connect(banner)
      .ban([{ account: signer1.address, data: evidenceBan }]);

    const { sender: senderReBan, evidence: evidenceReBan } =
      (await Util.getEventArgs(reBanTx, "Ban", verify)) as BanEvent["args"];
    assert(senderReBan === banner.address, "wrong sender in reban event");
    assert(
      evidenceReBan.account === signer1.address,
      "wrong account in reban event"
    );
    assert(evidenceReBan.data === evidenceBan, "wrong data in reban event");

    // Remove
    await verify
      .connect(remover)
      .remove([{ account: signer1.address, data: evidenceRemove }]);
  });

  it("should require non-zero admin address", async function () {
    this.timeout(0);
    const signers = await ethers.getSigners();

    await Util.assertError(
      async () =>
        await Util.verifyDeploy(signers[0], {
          admin: Util.zeroAddress,
          callback: Util.zeroAddress,
        }),
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

    const verify = (await Util.verifyDeploy(signers[0], {
      admin: defaultAdmin.address,
      callback: ethers.constants.AddressZero,
    })) as Verify;

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

    const state0 = await verify.state(signer1.address);
    assert(
      (
        await verify.statusAtBlock(
          state0,
          await ethers.provider.getBlockNumber()
        )
      ).eq(Status.Nil),
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
      (
        await verify.statusAtBlock(
          state1,
          await ethers.provider.getBlockNumber()
        )
      ).eq(Status.Added),
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
    await verify
      .connect(approver)
      .approve([{ account: signer1.address, data: evidenceApprove }]);

    const block2 = await ethers.provider.getBlockNumber();
    const state2 = await verify.state(signer1.address);
    assert(
      (
        await verify.statusAtBlock(
          state2,
          await ethers.provider.getBlockNumber()
        )
      ).eq(Status.Approved),
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
    await verify
      .connect(banner)
      .ban([{ account: signer1.address, data: evidenceBan }]);

    const block3 = await ethers.provider.getBlockNumber();
    const state3 = await verify.state(signer1.address);
    assert(
      (
        await verify.statusAtBlock(
          state3,
          await ethers.provider.getBlockNumber()
        )
      ).eq(Status.Banned),
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
    await verify
      .connect(remover)
      .remove([{ account: signer1.address, data: evidenceRemove }]);

    const state4 = await verify.state(signer1.address);
    assert(
      (
        await verify.statusAtBlock(
          state4,
          await ethers.provider.getBlockNumber()
        )
      ).eq(Status.Nil),
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

    const verify = (await Util.verifyDeploy(signers[0], {
      admin: defaultAdmin.address,
      callback: ethers.constants.AddressZero,
    })) as Verify;

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

    const verify = (await Util.verifyDeploy(signers[0], {
      admin: defaultAdmin.address,
      callback: ethers.constants.AddressZero,
    })) as Verify;

    const evidenceAdd0 = hexlify([...Buffer.from("Evidence for add0")]);

    // signer1 submits evidence
    const event0 = (await Util.getEventArgs(
      await verify.connect(signer1).add(evidenceAdd0),
      "RequestApprove",
      verify
    )) as RequestApproveEvent["args"];
    assert(event0.sender === signer1.address, "wrong sender in event0");
    assert(event0.evidence.data === evidenceAdd0, "wrong data in event0");

    const state0 = await verify.state(signer1.address);

    const evidenceAdd1 = hexlify([...Buffer.from("Evidence for add1")]);

    // signer1 can call `add()` again to submit new evidence, but it does not override state
    const event1 = (await Util.getEventArgs(
      await verify.connect(signer1).add(evidenceAdd1),
      "RequestApprove",
      verify
    )) as RequestApproveEvent["args"];
    assert(event1.sender === signer1.address, "wrong sender in event1");
    assert(event1.evidence.data === evidenceAdd1, "wrong data in event1");

    const state1 = await verify.state(signer1.address);

    // signer1 adding more evidence should not wipe their state
    for (let index = 0; index < state0.length; index++) {
      const propertyLeft = `${state0[index]}`;
      const propertyRight = `${state1[index]}`;
      assert(
        propertyLeft === propertyRight,
        `state not equivalent at position ${index}. Left ${propertyLeft}, Right ${propertyRight}`
      );
    }

    const evidenceAdd2 = hexlify([...Buffer.from("Evidence for add2")]);

    // another signer should be able to submit identical evidence
    const event2 = (await Util.getEventArgs(
      await verify.connect(signer2).add(evidenceAdd2),
      "RequestApprove",
      verify
    )) as RequestApproveEvent["args"];
    assert(event2.sender === signer2.address, "wrong sender in event2");
    assert(event2.evidence.data === evidenceAdd2, "wrong data in event2");

    // signer2 adding evidence should not wipe state for signer1
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

  it("should allow approver to automatically add an account that hasn't been added yet while approving it", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const defaultAdmin = signers[0];
    const aprAdmin = signers[1];
    const signer1 = signers[2];
    const approver = signers[3];
    const nonApprover = signers[4];

    const verify = (await Util.verifyDeploy(signers[0], {
      admin: defaultAdmin.address,
      callback: ethers.constants.AddressZero,
    })) as Verify;

    // defaultAdmin grants admin role
    await verify.grantRole(await verify.APPROVER_ADMIN(), aprAdmin.address);

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

    // approver admin grants approver role
    await verify
      .connect(aprAdmin)
      .grantRole(await verify.APPROVER(), approver.address);

    // const evidenceAdd = hexlify([...Buffer.from("Evidence for add")]);
    const evidenceApprove = hexlify([...Buffer.from("Evidence for approve")]);

    // await verify.connect(signer1).add(evidenceAdd);

    // // prevent approving zero address
    // await Util.assertError(
    //   async () =>
    //     await verify
    //       .connect(approver)
    //       .approve([{ account: Util.zeroAddress, data: evidenceApprove }]),
    //   "0_ADDRESS",
    //   "wrongly approved account with address of 0"
    // );

    await Util.assertError(
      async () =>
        await verify
          .connect(nonApprover)
          .approve([{ account: signer1.address, data: evidenceApprove }]),
      `AccessControl: account ${nonApprover.address.toLowerCase()} is missing role ${await verify.APPROVER()}`,
      "non-approver wrongly approved account"
    );

    // approve account
    const event0 = (await Util.getEventArgs(
      await verify
        .connect(approver)
        .approve([{ account: signer1.address, data: evidenceApprove }]),
      "Approve",
      verify
    )) as ApproveEvent["args"];
    assert(event0.sender === approver.address, "wrong sender in event0");
    assert(
      event0.evidence.account === signer1.address,
      "wrong account in event0"
    );
    assert(event0.evidence.data === evidenceApprove, "wrong data in event0");

    // check that signer1 has been approved
    const stateApproved = await verify.state(signer1.address);

    assert(
      stateApproved.approvedSince === (await ethers.provider.getBlockNumber()),
      `not approved
      expected  ${await ethers.provider.getBlockNumber()}
      got       ${stateApproved.approvedSince}`
    );
  });

  it("should allow only approver to approve accounts", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const defaultAdmin = signers[0];
    const aprAdmin = signers[1];
    const signer1 = signers[2];
    const approver = signers[3];
    const nonApprover = signers[4];

    const verify = (await Util.verifyDeploy(signers[0], {
      admin: defaultAdmin.address,
      callback: ethers.constants.AddressZero,
    })) as Verify;

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

    // // prevent approving zero address
    // await Util.assertError(
    //   async () =>
    //     await verify
    //       .connect(approver)
    //       .approve([{ account: Util.zeroAddress, data: evidenceApprove }]),
    //   "0_ADDRESS",
    //   "wrongly approved account with address of 0"
    // );

    await Util.assertError(
      async () =>
        await verify
          .connect(nonApprover)
          .approve([{ account: signer1.address, data: evidenceApprove }]),
      `AccessControl: account ${nonApprover.address.toLowerCase()} is missing role ${await verify.APPROVER()}`,
      "non-approver wrongly approved account"
    );

    // approve account
    const event0 = (await Util.getEventArgs(
      await verify
        .connect(approver)
        .approve([{ account: signer1.address, data: evidenceApprove }]),
      "Approve",
      verify
    )) as ApproveEvent["args"];
    assert(event0.sender === approver.address, "wrong sender in event0");
    assert(
      event0.evidence.account === signer1.address,
      "wrong account in event0"
    );
    assert(event0.evidence.data === evidenceApprove, "wrong data in event0");

    // check that signer1 has been approved
    const stateApproved = await verify.state(signer1.address);
    assert(
      stateApproved.approvedSince === (await ethers.provider.getBlockNumber()),
      "not approved"
    );

    // attempt another add when status is STATUS_APPROVED
    await Util.assertError(
      async () => await verify.connect(signer1).add(evidenceAdd),
      "ALREADY_EXISTS",
      "wrongly added when status was STATUS_APPROVED"
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

    const verify = (await Util.verifyDeploy(signers[0], {
      admin: defaultAdmin.address,
      callback: ethers.constants.AddressZero,
    })) as Verify;

    // defaultAdmin grants admin role
    await verify.grantRole(await verify.REMOVER_ADMIN(), rmvAdmin.address);

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

    // remover admin grants remover role
    await verify
      .connect(rmvAdmin)
      .grantRole(await verify.REMOVER(), remover.address);

    const evidenceAdd = hexlify([...Buffer.from("Evidence for add")]);
    const evidenceRemove = hexlify([...Buffer.from("Evidence for remove")]);

    await verify.connect(signer1).add(evidenceAdd);

    // // prevent removing account of address 0
    // await Util.assertError(
    //   async () =>
    //     await verify
    //       .connect(remover)
    //       .remove([{ account: Util.zeroAddress, data: evidenceRemove }]),
    //   "0_ADDRESS",
    //   "wrongly removed account with address of 0"
    // );

    await Util.assertError(
      async () =>
        await verify
          .connect(nonRemover)
          .remove([{ account: signer1.address, data: evidenceRemove }]),
      `AccessControl: account ${nonRemover.address.toLowerCase()} is missing role ${await verify.REMOVER()}`,
      "non-remover wrongly removed account"
    );

    // admin removes account
    const event0 = (await Util.getEventArgs(
      await verify
        .connect(remover)
        .remove([{ account: signer1.address, data: evidenceRemove }]),
      "Remove",
      verify
    )) as RemoveEvent["args"];
    assert(event0.sender === remover.address, "wrong sender in event0");
    assert(
      event0.evidence.account === signer1.address,
      "wrong account in event0"
    );
    assert(event0.evidence.data === evidenceRemove, "wrong data in event0");

    // check that signer1 has been removed
    const stateRemoved = await verify.state(signer1.address);
    assert(stateRemoved.addedSince === 0, "not removed");
    assert(stateRemoved.approvedSince === 0, "not removed");
    assert(stateRemoved.bannedSince === 0, "not removed");
  });

  it("should allow only banner to ban accounts", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const defaultAdmin = signers[0];
    const banAdmin = signers[1];
    const signer1 = signers[2];
    const banner = signers[3];
    const nonBanner = signers[4];

    const verify = (await Util.verifyDeploy(signers[0], {
      admin: defaultAdmin.address,
      callback: ethers.constants.AddressZero,
    })) as Verify;

    // defaultAdmin grants admin role
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

    // banner admin grants banner role
    await verify
      .connect(banAdmin)
      .grantRole(await verify.BANNER(), banner.address);

    const evidenceAdd = hexlify([...Buffer.from("Evidence for add")]);
    const evidenceBan = hexlify([...Buffer.from("Evidence for ban")]);

    await verify.connect(signer1).add(evidenceAdd);

    await Util.assertError(
      async () =>
        await verify
          .connect(nonBanner)
          .ban([{ account: signer1.address, data: evidenceBan }]),
      `AccessControl: account ${nonBanner.address.toLowerCase()} is missing role ${await verify.BANNER()}`,
      "non-banner wrongly banned account"
    );

    // admin bans account
    const event0 = (await Util.getEventArgs(
      await verify
        .connect(banner)
        .ban([{ account: signer1.address, data: evidenceBan }]),
      "Ban",
      verify
    )) as BanEvent["args"];
    assert(event0.sender === banner.address, "wrong sender in event0");
    assert(
      event0.evidence.account === signer1.address,
      "wrong account in event0"
    );
    assert(event0.evidence.data === evidenceBan, "wrong data in event0");

    // check that signer1 has been banned
    const stateBanned = await verify.state(signer1.address);
    assert(
      stateBanned.bannedSince === (await ethers.provider.getBlockNumber()),
      "not banned"
    );

    // attempt another add when status is STATUS_BANNED
    await Util.assertError(
      async () => await verify.connect(signer1).add(evidenceAdd),
      "ALREADY_EXISTS",
      "wrongly added when status was STATUS_BANNED"
    );
  });
});
