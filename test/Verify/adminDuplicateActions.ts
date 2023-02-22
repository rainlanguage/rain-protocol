import { assert } from "chai";
import { hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { CloneFactory, Verify } from "../../typechain";

import {
  ApproveEvent,
  BanEvent,
} from "../../typechain/contracts/verify/Verify";
import { basicDeploy } from "../../utils";
import {
  
  
  verifyCloneDeploy,
  verifyImplementation,
} from "../../utils/deploy/verify/deploy";
import { getEventArgs } from "../../utils/events";

describe("Verify duplicate admin actions", async function () {
  let implementVerify: Verify
  let cloneFactory: CloneFactory

  before(async () => {
    implementVerify = await verifyImplementation()

    //Deploy Clone Factory
    cloneFactory = (await basicDeploy("CloneFactory",{})) as CloneFactory
  });

  it("should support duplicate admin actions", async function () {
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
cloneFactory ,  
implementVerify , 
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

    const { sender, evidence } = (await getEventArgs(
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

    // Calling ban() again succeeds but does not update ban block.
    // This could occur with multiple banners operating concurrently and independently.
    const reBanTx = await verify
      .connect(banner)
      .ban([{ account: signer1.address, data: evidenceBan }]);

    const { sender: senderReBan, evidence: evidenceReBan } =
      (await getEventArgs(reBanTx, "Ban", verify)) as BanEvent["args"];
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
});
