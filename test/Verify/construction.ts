import { assert } from "chai";
import { ethers } from "hardhat";
import type { Verify } from "../../typechain";
import { VerifyFactory } from "../../typechain";
import { InitializeEvent } from "../../typechain/contracts/verify/Verify";
import {
  APPROVER,
  APPROVER_ADMIN,
  BANNER,
  BANNER_ADMIN,
  REMOVER,
  REMOVER_ADMIN,
} from "../../utils/constants/verify";
import { verifyDeploy } from "../../utils/deploy/verify/deploy";
import { getEventArgs } from "../../utils/events";
import { compareStructs } from "../../utils/test/compareStructs";

describe("Verify construction", async function () {
  let verifyFactory: VerifyFactory;

  before(async () => {
    const verifyFactoryFactory = await ethers.getContractFactory(
      "VerifyFactory"
    );
    verifyFactory = (await verifyFactoryFactory.deploy()) as VerifyFactory;
    await verifyFactory.deployed();
  });

  it("should construct and initialize correctly", async function () {
    const signers = await ethers.getSigners();
    const defaultAdmin = signers[0];

    const verifyConfigStruct = {
      admin: defaultAdmin.address,
      callback: ethers.constants.AddressZero,
    };

    const verify = (await verifyDeploy(
      defaultAdmin,
      verifyFactory,
      verifyConfigStruct
    )) as Verify;

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
    assert(callback === verifyConfigStruct.callback, "wrong callback address");

    const { sender, config } = (await getEventArgs(
      verify.deployTransaction,
      "Initialize",
      verify
    )) as InitializeEvent["args"];

    assert(
      sender === verifyFactory.address,
      "wrong sender in Initialize event"
    );
    compareStructs(config, verifyConfigStruct);
  });
});
