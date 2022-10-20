import { assert } from "chai";
import { hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { Verify, VerifyCallbackTest } from "../../typechain";
import { VerifyFactory } from "../../typechain";
import {
  ApproveEvent,
  BanEvent,
  RemoveEvent,
} from "../../typechain/contracts/verify/Verify";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import { verifyDeploy } from "../../utils/deploy/verify/deploy";
import { getEvents } from "../../utils/events";
import { assertError } from "../../utils/test/assertError";

describe("Verify callback", async function () {
  let verifyFactory: VerifyFactory;

  before(async () => {
    const verifyFactoryFactory = await ethers.getContractFactory(
      "VerifyFactory"
    );
    verifyFactory = (await verifyFactoryFactory.deploy()) as VerifyFactory;
    await verifyFactory.deployed();
  });

  it("should re-emit events associated with add, approve, ban and remove even if corresponding evidence has been deduped for the callback", async function () {
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
    const signer3 = signers[9];
    const signer4 = signers[10];

    const verifyCallback = (await basicDeploy(
      "VerifyCallbackTest",
      {}
    )) as VerifyCallbackTest;

    const verify = (await verifyDeploy(signers[0], verifyFactory, {
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

    const evidenceAdd = hexlify([...Buffer.from("Good")]);
    const evidenceApprove = hexlify([...Buffer.from("Good")]);
    const evidenceBan = hexlify([...Buffer.from("Good")]);
    const evidenceRemove = hexlify([...Buffer.from("Good")]);

    // add accounts

    await verify.connect(signer1).add(evidenceAdd);
    await verify.connect(signer2).add(evidenceAdd);
    await verify.connect(signer3).add(evidenceAdd);
    await verify.connect(signer4).add(evidenceAdd);

    // approve accounts

    await verify.connect(approver).approve([
      { account: signer1.address, data: evidenceApprove },
      { account: signer2.address, data: evidenceApprove },
    ]);

    const approveTx = await verify.connect(approver).approve([
      { account: signer1.address, data: evidenceApprove },
      { account: signer2.address, data: evidenceApprove },
      { account: signer3.address, data: evidenceApprove },
      { account: signer4.address, data: evidenceApprove },
    ]);

    const approveEvents = (await getEvents(
      approveTx,
      "Approve",
      verify
    )) as ApproveEvent["args"][];
    assert(approveEvents.length === 4);
    approveEvents.forEach(({ sender, evidence }, index) => {
      assert(
        sender === approver.address,
        `wrong sender in approve event ${index}`
      );
      assert(
        evidence.data === evidenceApprove,
        `wrong data in approve event ${index}`
      );
      assert(
        evidence.account === signers[7 + index].address,
        `wrong account in approve event ${index}`
      );
    });

    // ban accounts

    await verify.connect(banner).ban([
      { account: signer1.address, data: evidenceBan },
      { account: signer2.address, data: evidenceBan },
    ]);

    const banTx = await verify.connect(banner).ban([
      { account: signer1.address, data: evidenceBan },
      { account: signer2.address, data: evidenceBan },
      { account: signer3.address, data: evidenceBan },
      { account: signer4.address, data: evidenceBan },
    ]);

    const banEvents = (await getEvents(
      banTx,
      "Ban",
      verify
    )) as BanEvent["args"][];
    assert(banEvents.length === 4);
    banEvents.forEach(({ sender, evidence }, index) => {
      assert(sender === banner.address, `wrong sender in ban event ${index}`);
      assert(evidence.data === evidenceBan, `wrong data in ban event ${index}`);
      assert(
        evidence.account === signers[7 + index].address,
        `wrong account in ban event ${index}`
      );
    });

    // remove accounts

    await verify.connect(remover).remove([
      { account: signer1.address, data: evidenceRemove },
      { account: signer2.address, data: evidenceRemove },
    ]);

    const removeTx = await verify.connect(remover).remove([
      { account: signer1.address, data: evidenceRemove },
      { account: signer2.address, data: evidenceRemove },
      { account: signer3.address, data: evidenceRemove },
      { account: signer4.address, data: evidenceRemove },
    ]);

    const removeEvents = (await getEvents(
      removeTx,
      "Remove",
      verify
    )) as RemoveEvent["args"][];
    assert(removeEvents.length === 4);
    removeEvents.forEach(({ sender, evidence }, index) => {
      assert(
        sender === remover.address,
        `wrong sender in remove event ${index}`
      );
      assert(
        evidence.data === evidenceRemove,
        `wrong data in remove event ${index}`
      );
      assert(
        evidence.account === signers[7 + index].address,
        `wrong account in remove event ${index}`
      );
    });
  });

  it("should handle filtering batches of addresses in callback contract hooks (gas efficiency)", async function () {
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
    const signer3 = signers[9];
    const signer4 = signers[10];
    const signer5 = signers[11];
    const signer6 = signers[12];
    const signer7 = signers[13];
    const signer8 = signers[14];
    const signer9 = signers[15];

    const verifyCallback = (await basicDeploy(
      "VerifyCallbackTest",
      {}
    )) as VerifyCallbackTest;

    const verify = (await verifyDeploy(signers[0], verifyFactory, {
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

    const evidenceAdd = hexlify([...Buffer.from("Good")]);
    const evidenceApprove = hexlify([...Buffer.from("Good")]);
    const evidenceBan = hexlify([...Buffer.from("Good")]);
    const evidenceRemove = hexlify([...Buffer.from("Good")]);

    // add accounts (not strictly necessary to add every account as the approve and ban steps automatically add if not already added)

    await verify.connect(signer1).add(evidenceAdd);
    await verify.connect(signer2).add(evidenceAdd);
    await verify.connect(signer3).add(evidenceAdd);
    await verify.connect(signer4).add(evidenceAdd);
    await verify.connect(signer5).add(evidenceAdd);
    await verify.connect(signer6).add(evidenceAdd);
    await verify.connect(signer7).add(evidenceAdd);
    await verify.connect(signer8).add(evidenceAdd);
    await verify.connect(signer9).add(evidenceAdd);

    // approve accounts

    await verify.connect(approver).approve([
      { account: signer1.address, data: evidenceApprove },
      { account: signer2.address, data: evidenceApprove },
      { account: signer3.address, data: evidenceApprove },
    ]);

    await verify.connect(approver).approve([
      // Include some signers a second time. The test contract will throw an
      // error if it sees the same approval twice. This shows the Verify
      // contract filters out dupes.
      { account: signer1.address, data: evidenceApprove },
      { account: signer2.address, data: evidenceApprove },
      { account: signer3.address, data: evidenceApprove },
      // The following signers should be approved and not filtered out by the
      // Verify contract.
      { account: signer4.address, data: evidenceApprove },
      { account: signer5.address, data: evidenceApprove },
      { account: signer6.address, data: evidenceApprove },
      { account: signer7.address, data: evidenceApprove },
      { account: signer8.address, data: evidenceApprove },
      { account: signer9.address, data: evidenceApprove },
    ]);

    // ban accounts

    await verify.connect(banner).ban([
      { account: signer1.address, data: evidenceBan },
      { account: signer2.address, data: evidenceBan },
      { account: signer3.address, data: evidenceBan },
    ]);

    await verify.connect(banner).ban([
      // Include some signers a second time. The test contract will throw an
      // error if it sees the same ban twice. This shows the Verify contract
      // filters out dupes.
      { account: signer1.address, data: evidenceBan },
      { account: signer2.address, data: evidenceBan },
      { account: signer3.address, data: evidenceBan },
      // The following signers should be banned and not filtered out by the
      // Verify contract.
      { account: signer4.address, data: evidenceBan },
      { account: signer5.address, data: evidenceBan },
      { account: signer6.address, data: evidenceBan },
      { account: signer7.address, data: evidenceBan },
      { account: signer8.address, data: evidenceBan },
      { account: signer9.address, data: evidenceBan },
    ]);

    // remove accounts

    await verify.connect(remover).remove([
      { account: signer1.address, data: evidenceRemove },
      { account: signer2.address, data: evidenceRemove },
      { account: signer3.address, data: evidenceRemove },
    ]);

    await verify.connect(remover).remove([
      // Include some signers a second time. The test contract will throw an
      // error if it sees the same removal twice. This shows the Verify contract
      // filters out dupes.
      { account: signer1.address, data: evidenceRemove },
      { account: signer2.address, data: evidenceRemove },
      { account: signer3.address, data: evidenceRemove },
      // The following signers should be removed and not filtered out by the
      // Verify contract.
      { account: signer4.address, data: evidenceRemove },
      { account: signer5.address, data: evidenceRemove },
      { account: signer6.address, data: evidenceRemove },
      { account: signer7.address, data: evidenceRemove },
      { account: signer8.address, data: evidenceRemove },
      { account: signer9.address, data: evidenceRemove },
    ]);
  });

  it("should trigger verify callback contract hooks after adding, approving, banning and removing", async function () {
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

    const verifyCallback = (await basicDeploy(
      "VerifyCallbackTest",
      {}
    )) as VerifyCallbackTest;

    const verify = (await verifyDeploy(signers[0], verifyFactory, {
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
    await assertError(
      async () => await verify.connect(signer1).add(badEvidenceAdd),
      "BAD_EVIDENCE",
      "afterAdd hook did not require Good evidence"
    );
    await verify.connect(signer1).add(goodEvidenceAdd);
    await assertError(
      async () => await verify.connect(signer1).add(goodEvidenceAdd),
      "PRIOR_ADD",
      "afterAdd hook did not prevent 2nd add"
    );

    // approve account
    await assertError(
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
    await assertError(
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
    await assertError(
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
});
