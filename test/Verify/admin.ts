import { assert } from "chai";
import { ethers } from "hardhat";
import type { CloneFactory, Verify } from "../../typechain";
import { basicDeploy } from "../../utils";

import {
  verifyCloneDeploy,
  verifyImplementation,
} from "../../utils/deploy/verify/deploy";
import { assertError } from "../../utils/test/assertError";

describe("Verify admin", async function () {
  let implementVerify: Verify;
  let cloneFactory: CloneFactory;

  before(async () => {
    implementVerify = await verifyImplementation();

    //Deploy Clone Factory
    cloneFactory = (await basicDeploy("CloneFactory", {})) as CloneFactory;
  });

  it("should allow admins to grant others the same admin role", async function () {
    const signers = await ethers.getSigners();
    const [
      defaultAdmin,
      aprAdmin0,
      rmvAdmin0,
      banAdmin0,
      aprAdmin1,
      rmvAdmin1,
      banAdmin1,
    ] = signers;

    const verify = await verifyCloneDeploy(
      signers[0],
      cloneFactory,
      implementVerify,
      defaultAdmin.address,
      ethers.constants.AddressZero
    );

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
    const signers = await ethers.getSigners();
    const [
      defaultAdmin,
      aprAdmin0,
      rmvAdmin0,
      banAdmin0,
      aprAdmin1,
      rmvAdmin1,
      banAdmin1,
    ] = signers;

    const verify = await verifyCloneDeploy(
      signers[0],
      cloneFactory,
      implementVerify,
      defaultAdmin.address,
      ethers.constants.AddressZero
    );

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

    await assertError(
      async () =>
        await verify.grantRole(
          await verify.APPROVER_ADMIN(),
          aprAdmin1.address
        ),
      "is missing role",
      "default admin wrongly granted approver admin role after renouncing default admin role"
    );
    await assertError(
      async () =>
        await verify.grantRole(await verify.REMOVER_ADMIN(), rmvAdmin1.address),
      "is missing role",
      "default admin wrongly granted remover admin role after renouncing default admin role"
    );
    await assertError(
      async () =>
        await verify.grantRole(await verify.BANNER_ADMIN(), banAdmin1.address),
      "is missing role",
      "default admin wrongly granted banner admin role after renouncing default admin role"
    );
  });

  it("should allow admin to delegate admin roles which can then grant non-admin roles", async function () {
    const signers = await ethers.getSigners();
    const [
      defaultAdmin,
      aprAdmin,
      rmvAdmin,
      banAdmin,
      approver,
      remover,
      banner,
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
  });

  it("should require non-zero admin address", async function () {
    const signers = await ethers.getSigners();

    await assertError(
      async () =>
        await verifyCloneDeploy(
          signers[0],
          cloneFactory,
          implementVerify,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero
        ),
      "0_ACCOUNT",
      "wrongly constructed Verify with admin as zero address"
    );
  });
});
