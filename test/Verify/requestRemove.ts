import { assert } from "chai";
import { hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { Verify } from "../../typechain";
import { VerifyFactory } from "../../typechain";
import { RequestRemoveEvent } from "../../typechain/contracts/verify/Verify";
import {
  verifyDeploy,
  verifyFactoryDeploy,
} from "../../utils/deploy/verify/deploy";
import { getEventArgs } from "../../utils/events";
import { assertError } from "../../utils/test/assertError";

describe("Verify request remove", async function () {
  let verifyFactory: VerifyFactory;

  before(async () => {
    verifyFactory = await verifyFactoryDeploy();
  });

  it("should allow anyone to submit data to support a request to remove an account", async function () {
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
    await assertError(
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
    const event0 = (await getEventArgs(
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
});
