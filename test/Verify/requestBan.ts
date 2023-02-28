import { assert } from "chai";
import { hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { CloneFactory, Verify } from "../../typechain";
import { RequestBanEvent } from "../../typechain/contracts/verify/Verify";
import { basicDeploy } from "../../utils";
import {
  verifyCloneDeploy,
  verifyImplementation,
} from "../../utils/deploy/verify/deploy";
import { getEventArgs } from "../../utils/events";
import { assertError } from "../../utils/test/assertError";

describe("Verify request ban", async function () {
  let implementVerify: Verify;
  let cloneFactory: CloneFactory;

  before(async () => {
    implementVerify = await verifyImplementation();

    //Deploy Clone Factory
    cloneFactory = (await basicDeploy("CloneFactory", {})) as CloneFactory;
  });

  it("should allow anyone to submit data to support a request to ban an account", async function () {
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
      signer2,
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
    await assertError(
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
    const event0 = (await getEventArgs(
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
});
