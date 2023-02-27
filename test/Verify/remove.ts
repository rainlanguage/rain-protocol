import { assert } from "chai";
import { hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { CloneFactory, Verify } from "../../typechain";

import { RemoveEvent } from "../../typechain/contracts/verify/Verify";
import { basicDeploy } from "../../utils";
import {
  verifyCloneDeploy,
  verifyImplementation,
} from "../../utils/deploy/verify/deploy";
import { getEventArgs } from "../../utils/events";
import { assertError } from "../../utils/test/assertError";

describe("Verify remove", async function () {
  let implementVerify: Verify;
  let cloneFactory: CloneFactory;

  before(async () => {
    implementVerify = await verifyImplementation();

    //Deploy Clone Factory
    cloneFactory = (await basicDeploy("CloneFactory", {})) as CloneFactory;
  });

  it("should not grant remover ability to approve or ban if they only have REMOVER role", async function () {
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

    const verify = await verifyCloneDeploy(
      signers[0],
      cloneFactory,
      implementVerify,
      defaultAdmin.address,
      ethers.constants.AddressZero
    );

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

    await assertError(
      async () =>
        await verify
          .connect(remover)
          .approve([{ account: signer1.address, data: evidenceApprove }]),
      `AccessControl: account ${remover.address.toLowerCase()} is missing role ${await verify.APPROVER()}`,
      "non-approver wrongly approved account"
    );

    await assertError(
      async () =>
        await verify
          .connect(approver)
          .ban([{ account: signer1.address, data: evidenceBan }]),
      `AccessControl: account ${approver.address.toLowerCase()} is missing role ${await verify.BANNER()}`,
      "non-banner wrongly banned account"
    );
  });

  it("should allow only remover to remove accounts", async function () {
    const signers = await ethers.getSigners();
    const defaultAdmin = signers[0];
    const rmvAdmin = signers[1];
    const signer1 = signers[2];
    const remover = signers[3];
    const nonRemover = signers[4];

    const verify = await verifyCloneDeploy(
      signers[0],
      cloneFactory,
      implementVerify,
      defaultAdmin.address,
      ethers.constants.AddressZero
    );

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

    await assertError(
      async () =>
        await verify
          .connect(nonRemover)
          .remove([{ account: signer1.address, data: evidenceRemove }]),
      `AccessControl: account ${nonRemover.address.toLowerCase()} is missing role ${await verify.REMOVER()}`,
      "non-remover wrongly removed account"
    );

    // admin removes account
    const event0 = (await getEventArgs(
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
});
