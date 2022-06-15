import { assert } from "chai";
import { hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { BanEvent, Verify } from "../../typechain/Verify";
import { VerifyFactory } from "../../typechain/VerifyFactory";
import {
  assertError,
  getBlockTimestamp,
  getEventArgs,
  verifyDeploy,
} from "../../utils";

describe("Verify ban", async function () {
  let verifyFactory: VerifyFactory;

  before(async () => {
    const verifyFactoryFactory = await ethers.getContractFactory(
      "VerifyFactory"
    );
    verifyFactory = (await verifyFactoryFactory.deploy()) as VerifyFactory;
    await verifyFactory.deployed();
  });

  it("should allow banner to preemptively ban an account before it is added, which also triggers add callback before ban callback", async function () {
    const signers = await ethers.getSigners();
    const defaultAdmin = signers[0];
    const banAdmin = signers[1];
    const signer1 = signers[2];
    const banner = signers[3];
    const nonBanner = signers[4];

    const verify = (await verifyDeploy(signers[0], verifyFactory, {
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

    // signer1 does not add their account
    // if Verify did not trigger add callback before ban callback, test callback contract would error with `NOT_ADDED_CALLBACK`
    // await verify.connect(signer1).add(evidenceAdd);

    await assertError(
      async () =>
        await verify
          .connect(nonBanner)
          .ban([{ account: signer1.address, data: evidenceBan }]),
      `AccessControl: account ${nonBanner.address.toLowerCase()} is missing role ${await verify.BANNER()}`,
      "non-banner wrongly banned account"
    );

    // admin bans account
    const event0 = (await getEventArgs(
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
      stateBanned.bannedSince === (await getBlockTimestamp()),
      "not banned"
    );

    // attempt another add when status is STATUS_BANNED
    await assertError(
      async () => await verify.connect(signer1).add(evidenceAdd),
      "ALREADY_EXISTS",
      "wrongly added when status was STATUS_BANNED"
    );
  });

  it("should not grant banner ability to approve or remove if they only have BANNER role", async function () {
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
          .remove([{ account: signer1.address, data: evidenceRemove }]),
      `AccessControl: account ${approver.address.toLowerCase()} is missing role ${await verify.REMOVER()}`,
      "non-remover wrongly removed account"
    );
  });

  it("should allow only banner to ban accounts", async function () {
    const signers = await ethers.getSigners();
    const defaultAdmin = signers[0];
    const banAdmin = signers[1];
    const signer1 = signers[2];
    const banner = signers[3];
    const nonBanner = signers[4];

    const verify = (await verifyDeploy(signers[0], verifyFactory, {
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

    await assertError(
      async () =>
        await verify
          .connect(nonBanner)
          .ban([{ account: signer1.address, data: evidenceBan }]),
      `AccessControl: account ${nonBanner.address.toLowerCase()} is missing role ${await verify.BANNER()}`,
      "non-banner wrongly banned account"
    );

    // admin bans account
    const event0 = (await getEventArgs(
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
      stateBanned.bannedSince === (await getBlockTimestamp()),
      "not banned"
    );

    // attempt another add when status is STATUS_BANNED
    await assertError(
      async () => await verify.connect(signer1).add(evidenceAdd),
      "ALREADY_EXISTS",
      "wrongly added when status was STATUS_BANNED"
    );
  });
});
