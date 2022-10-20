import { assert } from "chai";
import { hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { Verify } from "../../typechain";
import { VerifyFactory } from "../../typechain";
import { RequestApproveEvent } from "../../typechain/contracts/verify/Verify";
import { verifyDeploy } from "../../utils/deploy/verify/deploy";
import { getEventArgs } from "../../utils/events";

describe("Verify request approve", async function () {
  let verifyFactory: VerifyFactory;

  before(async () => {
    const verifyFactoryFactory = await ethers.getContractFactory(
      "VerifyFactory"
    );
    verifyFactory = (await verifyFactoryFactory.deploy()) as VerifyFactory;
    await verifyFactory.deployed();
  });

  it("should allow anyone to add data to support verification", async function () {
    const signers = await ethers.getSigners();
    const defaultAdmin = signers[0];
    const signer1 = signers[1];
    const signer2 = signers[2];

    const verify = (await verifyDeploy(signers[0], verifyFactory, {
      admin: defaultAdmin.address,
      callback: ethers.constants.AddressZero,
    })) as Verify;

    const evidenceAdd0 = hexlify([...Buffer.from("Evidence for add0")]);

    // signer1 submits evidence
    const event0 = (await getEventArgs(
      await verify.connect(signer1).add(evidenceAdd0),
      "RequestApprove",
      verify
    )) as RequestApproveEvent["args"];
    assert(event0.sender === signer1.address, "wrong sender in event0");
    assert(event0.evidence.data === evidenceAdd0, "wrong data in event0");

    const state0 = await verify.state(signer1.address);

    const evidenceAdd1 = hexlify([...Buffer.from("Evidence for add1")]);

    // signer1 can call `add()` again to submit new evidence, but it does not override state
    const event1 = (await getEventArgs(
      await verify.connect(signer1).add(evidenceAdd1),
      "RequestApprove",
      verify
    )) as RequestApproveEvent["args"];
    assert(event1.sender === signer1.address, "wrong sender in event1");
    assert(event1.evidence.data === evidenceAdd1, "wrong data in event1");

    const state1 = await verify.state(signer1.address);

    // signer1 adding more evidence should not wipe their state
    for (let index = 0; index < state0.length; index++) {
      const propertyLeft = `${state0[index]}`;
      const propertyRight = `${state1[index]}`;
      assert(
        propertyLeft === propertyRight,
        `state not equivalent at position ${index}. Left ${propertyLeft}, Right ${propertyRight}`
      );
    }

    const evidenceAdd2 = hexlify([...Buffer.from("Evidence for add2")]);

    // another signer should be able to submit identical evidence
    const event2 = (await getEventArgs(
      await verify.connect(signer2).add(evidenceAdd2),
      "RequestApprove",
      verify
    )) as RequestApproveEvent["args"];
    assert(event2.sender === signer2.address, "wrong sender in event2");
    assert(event2.evidence.data === evidenceAdd2, "wrong data in event2");

    // signer2 adding evidence should not wipe state for signer1
    const state2 = await verify.state(signer1.address);
    for (let index = 0; index < state0.length; index++) {
      const propertyLeft = `${state0[index]}`;
      const propertyRight = `${state2[index]}`;
      assert(
        propertyLeft === propertyRight,
        `state not equivalent at position ${index}. Left ${propertyLeft}, Right ${propertyRight}`
      );
    }
  });
});
