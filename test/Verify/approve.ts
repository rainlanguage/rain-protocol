import { assert } from "chai";
import { hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { CloneFactory, Verify } from "../../typechain";

import { ApproveEvent } from "../../typechain/contracts/verify/Verify";
import {
  assertError,
  basicDeploy,
  getBlockTimestamp,
  getEventArgs,
  verifyCloneDeploy,
  verifyImplementation,
} from "../../utils";
import { flowCloneFactory } from "../../utils/deploy/factory/cloneFactory";

describe("Verify approve", async function () {
  let implementVerify: Verify;
  let cloneFactory: CloneFactory;

  before(async () => {
    implementVerify = await verifyImplementation();

    //Deploy Clone Factory
    cloneFactory = await flowCloneFactory();
  });

  it("should not grant approver ability to remove or ban if they only have APPROVER role", async function () {
    const signers = await ethers.getSigners();
    const [
      defaultAdmin,
      aprAdmin,
      rmvAdmin,
      banAdmin,
      approver,
      remover,
      banner,
      signer1,
    ] = signers;

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
    const evidenceRemove = hexlify([...Buffer.from("Evidence for remove")]);
    const evidenceBan = hexlify([...Buffer.from("Evidence for ban")]);

    await verify.connect(signer1).add(evidenceAdd);

    await assertError(
      async () =>
        await verify
          .connect(approver)
          .remove([{ account: signer1.address, data: evidenceRemove }]),
      `AccessControl: account ${approver.address.toLowerCase()} is missing role ${await verify.REMOVER()}`,
      "non-remover wrongly removed account"
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

  it("should allow approver to automatically add an account that hasn't been added yet while approving it", async function () {
    const signers = await ethers.getSigners();
    const [defaultAdmin, aprAdmin, signer1, approver, nonApprover] = signers;

    const verify = await verifyCloneDeploy(
      signers[0],
      cloneFactory,
      implementVerify,
      defaultAdmin.address,
      ethers.constants.AddressZero
    );

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

    // signer1 does not add their account
    // if Verify did not trigger add callback before approve callback, test callback contract would error with `NOT_ADDED_CALLBACK`
    // await verify.connect(signer1).add(evidenceAdd);

    // // prevent approving zero address
    // await assertError(
    //   async () =>
    //     await verify
    //       .connect(approver)
    //       .approve([{ account: zeroAddress, data: evidenceApprove }]),
    //   "0_ADDRESS",
    //   "wrongly approved account with address of 0"
    // );

    await assertError(
      async () =>
        await verify
          .connect(nonApprover)
          .approve([{ account: signer1.address, data: evidenceApprove }]),
      `AccessControl: account ${nonApprover.address.toLowerCase()} is missing role ${await verify.APPROVER()}`,
      "non-approver wrongly approved account"
    );

    // approve account
    const event0 = (await getEventArgs(
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
      stateApproved.approvedSince === (await getBlockTimestamp()),
      `not approved
      expected  ${await getBlockTimestamp()}
      got       ${stateApproved.approvedSince}`
    );
  });

  it("should allow only approver to approve accounts", async function () {
    const signers = await ethers.getSigners();
    const [defaultAdmin, aprAdmin, signer1, approver, nonApprover] = signers;

    const verify = await verifyCloneDeploy(
      signers[0],
      cloneFactory,
      implementVerify,
      defaultAdmin.address,
      ethers.constants.AddressZero
    );

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
    // await assertError(
    //   async () =>
    //     await verify
    //       .connect(approver)
    //       .approve([{ account: zeroAddress, data: evidenceApprove }]),
    //   "0_ADDRESS",
    //   "wrongly approved account with address of 0"
    // );

    await assertError(
      async () =>
        await verify
          .connect(nonApprover)
          .approve([{ account: signer1.address, data: evidenceApprove }]),
      `AccessControl: account ${nonApprover.address.toLowerCase()} is missing role ${await verify.APPROVER()}`,
      "non-approver wrongly approved account"
    );

    // approve account
    const event0 = (await getEventArgs(
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
      stateApproved.approvedSince === (await getBlockTimestamp()),
      "not approved"
    );

    // attempt another add when status is STATUS_APPROVED
    await assertError(
      async () => await verify.connect(signer1).add(evidenceAdd),
      "ALREADY_EXISTS",
      "wrongly added when status was STATUS_APPROVED"
    );
  });
});
