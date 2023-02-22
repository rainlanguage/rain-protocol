import { assert } from "chai";
import { hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { CloneFactory, Verify } from "../../typechain";
import {
  basicDeploy,
  getBlockTimestamp,
  max_uint32,
  verifyCloneDeploy,
  verifyImplementation,
} from "../../utils";
import { Status } from "../../utils/types/verify";

describe("Verify state", async function () {
  let implementVerify: Verify;
  let cloneFactory: CloneFactory;

  before(async () => {
    implementVerify = await verifyImplementation();

    //Deploy Clone Factory
    cloneFactory = (await basicDeploy("CloneFactory", {})) as CloneFactory;
  });

  it("should return correct state for a given account", async function () {
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

    const state0 = await verify.state(signer1.address);
    assert(
      (await verify.statusAtTime(state0, await getBlockTimestamp())).eq(
        Status.Nil
      ),
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

    const timestamp1 = await getBlockTimestamp();
    const state1 = await verify.state(signer1.address);
    assert(
      (await verify.statusAtTime(state1, await getBlockTimestamp())).eq(
        Status.Added
      ),
      "status should be Added"
    );
    assert(
      state1.addedSince === timestamp1,
      `addedSince: expected timestamp1 ${timestamp1} got ${state1.addedSince}`
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

    const timestamp2 = await getBlockTimestamp();
    const state2 = await verify.state(signer1.address);
    assert(
      (await verify.statusAtTime(state2, await getBlockTimestamp())).eq(
        Status.Approved
      ),
      "status should be Approved"
    );
    assert(
      state2.addedSince === timestamp1,
      `addedSince: expected timestamp1 ${timestamp1} got ${state2.addedSince}`
    );
    assert(
      state2.approvedSince === timestamp2,
      `approvedSince: expected timestamp2 ${timestamp2} got ${state2.approvedSince}`
    );
    assert(
      max_uint32.eq(state2.bannedSince),
      `bannedSince should be uninitialized, got ${state1.bannedSince}`
    );

    // ban account
    await verify
      .connect(banner)
      .ban([{ account: signer1.address, data: evidenceBan }]);

    const timestamp3 = await getBlockTimestamp();
    const state3 = await verify.state(signer1.address);
    assert(
      (await verify.statusAtTime(state3, await getBlockTimestamp())).eq(
        Status.Banned
      ),
      "status should be Banned"
    );
    assert(
      state3.addedSince === timestamp1,
      `addedSince: expected timestamp1 ${timestamp1} got ${state3.addedSince}`
    );
    assert(
      state3.approvedSince === timestamp2,
      `approvedSince: expected timestamp2 ${timestamp2} got ${state3.approvedSince}`
    );
    assert(
      state3.bannedSince === timestamp3,
      `expected timestamp3 ${timestamp3} got ${state3.bannedSince}`
    );

    // remove account
    await verify
      .connect(remover)
      .remove([{ account: signer1.address, data: evidenceRemove }]);

    const state4 = await verify.state(signer1.address);
    assert(
      (await verify.statusAtTime(state4, await getBlockTimestamp())).eq(
        Status.Nil
      ),
      "status should be cleared"
    );
    assert(state4.addedSince === 0, "addedSince should be cleared");
    assert(state4.approvedSince === 0, "approvedSince should be cleared");
    assert(state4.bannedSince === 0, "bannedSince should be cleared");
  });
});
