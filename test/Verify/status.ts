import { assert } from "chai";
import { ethers } from "hardhat";
import type { Verify } from "../../typechain/Verify";
import { hexlify } from "ethers/lib/utils";
import { Status } from "../../utils/types/verify";
import { VerifyFactory } from "../../typechain/VerifyFactory";
import { verifyDeploy } from "../../utils/deploy/verify";
import { getBlockTimestamp } from "../../utils/hardhat";

describe("Verify status", async function () {
  let verifyFactory: VerifyFactory;

  before(async () => {
    const verifyFactoryFactory = await ethers.getContractFactory(
      "VerifyFactory"
    );
    verifyFactory = (await verifyFactoryFactory.deploy()) as VerifyFactory;
    await verifyFactory.deployed();
  });

  it("statusAtTime should return correct status for any given state & block number", async function () {
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

    const verify = (await verifyDeploy(signers[0], verifyFactory, {
      admin: defaultAdmin.address,
      callback: ethers.constants.AddressZero,
    })) as Verify;

    // defaultAdmin grants admin roles
    await verify.grantRole(await verify.APPROVER_ADMIN(), aprAdmin.address);
    await verify.grantRole(await verify.REMOVER_ADMIN(), rmvAdmin.address);
    await verify.grantRole(await verify.BANNER_ADMIN(), banAdmin.address);

    const state0 = await verify.state(signer1.address);
    assert(
      (await verify.statusAtTime(state0, await getBlockTimestamp())).eq(
        Status.Nil
      ),
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

    const blockBeforeAdd = await getBlockTimestamp();

    const evidenceAdd = hexlify([...Buffer.from("Evidence for add")]);
    const evidenceApprove = hexlify([...Buffer.from("Evidence for approve")]);
    const evidenceBan = hexlify([...Buffer.from("Evidence for ban")]);
    const evidenceRemove = hexlify([...Buffer.from("Evidence for remove")]);

    await verify.connect(signer1).add(evidenceAdd);

    const state1 = await verify.state(signer1.address);
    assert(
      (await verify.statusAtTime(state1, await getBlockTimestamp())).eq(
        Status.Added
      ),
      "status should be Added"
    );

    const blockBeforeApprove = await getBlockTimestamp();

    // approve account
    await verify
      .connect(approver)
      .approve([{ account: signer1.address, data: evidenceApprove }]);

    const state2 = await verify.state(signer1.address);
    assert(
      (await verify.statusAtTime(state2, await getBlockTimestamp())).eq(
        Status.Approved
      ),
      "status should be Approved"
    );

    const blockBeforeBan = await getBlockTimestamp();

    // ban account
    await verify
      .connect(banner)
      .ban([{ account: signer1.address, data: evidenceBan }]);

    const state3 = await verify.state(signer1.address);
    assert(
      (await verify.statusAtTime(state3, await getBlockTimestamp())).eq(
        Status.Banned
      ),
      "status should be Banned"
    );

    // interrogate history using latest state, before being cleared with `.remove()`
    assert(
      (await verify.statusAtTime(state3, blockBeforeAdd)).eq(Status.Nil),
      "status should be Nil before add"
    );
    assert(
      (await verify.statusAtTime(state3, blockBeforeApprove)).eq(Status.Added),
      "status should be Added before approve"
    );
    assert(
      (await verify.statusAtTime(state3, blockBeforeBan)).eq(Status.Approved),
      "status should be Approved before ban"
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
  });
});
