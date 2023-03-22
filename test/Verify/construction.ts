import { assert } from "chai";
import { ethers } from "hardhat";
import type { CloneFactory, Verify } from "../../typechain";

import {
  InitializeEvent,
  VerifyConfigStruct,
} from "../../typechain/contracts/verify/Verify";
import {
  APPROVER,
  APPROVER_ADMIN,
  BANNER,
  BANNER_ADMIN,
  REMOVER,
  REMOVER_ADMIN,
} from "../../utils/constants/verify";
import { flowCloneFactory } from "../../utils/deploy/factory/cloneFactory";

import {
  verifyCloneDeploy,
  verifyImplementation,
} from "../../utils/deploy/verify/deploy";
import { getEventArgs } from "../../utils/events";
import { compareStructs } from "../../utils/test/compareStructs";

describe("Verify construction", async function () {
  let implementVerify: Verify;
  let cloneFactory: CloneFactory;

  before(async () => {
    implementVerify = await verifyImplementation();

    //Deploy Clone Factory
    cloneFactory = await flowCloneFactory();
  });

  it("should construct and initialize correctly", async function () {
    const signers = await ethers.getSigners();
    const defaultAdmin = signers[0];

    const verifyConfig: VerifyConfigStruct = {
      admin: defaultAdmin.address,
      callback: ethers.constants.AddressZero,
    };

    const verify = await verifyCloneDeploy(
      defaultAdmin,
      cloneFactory,
      implementVerify,
      defaultAdmin.address,
      ethers.constants.AddressZero
    );

    assert(
      (await verify.APPROVER_ADMIN()) === APPROVER_ADMIN,
      "wrong APPROVER_ADMIN hash value"
    );
    assert((await verify.APPROVER()) === APPROVER, "wrong APPROVER hash value");

    assert(
      (await verify.REMOVER_ADMIN()) === REMOVER_ADMIN,
      "wrong REMOVER_ADMIN hash value"
    );
    assert((await verify.REMOVER()) === REMOVER, "wrong REMOVER hash value");

    assert(
      (await verify.BANNER_ADMIN()) === BANNER_ADMIN,
      "wrong BANNER_ADMIN hash value"
    );
    assert((await verify.BANNER()) === BANNER, "wrong BANNER hash value");

    const callback = await verify.callback();
    assert(callback === verifyConfig.callback, "wrong callback address");

    const { sender, config } = (await getEventArgs(
      verify.deployTransaction,
      "Initialize",
      verify
    )) as InitializeEvent["args"];

    assert(sender === cloneFactory.address, "wrong sender in Initialize event");
    compareStructs(config, verifyConfig);
  });
});
