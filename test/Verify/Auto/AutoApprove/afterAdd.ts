import { assert } from "chai";
import { hexlify, hexZeroPad } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { StateConfigStruct } from "../../../../typechain/AutoApprove";
import { AutoApproveFactory } from "../../../../typechain/AutoApproveFactory";
import { ApproveEvent } from "../../../../typechain/Verify";
import {
  autoApproveDeploy,
  autoApproveFactoryDeploy,
} from "../../../../utils/deploy/autoApprove";
import {
  verifyDeploy,
  verifyFactoryDeploy,
} from "../../../../utils/deploy/verify";
import { getEventArgs } from "../../../../utils/events";
import { Opcode } from "../../../../utils/rainvm/ops/autoApproveOps";
import { op } from "../../../../utils/rainvm/vm";
import { assertError } from "../../../../utils/test/assertError";

describe("AutoApprove afterAdd", async function () {
  let autoApproveFactory: AutoApproveFactory;

  before(async () => {
    autoApproveFactory = await autoApproveFactoryDeploy();
  });

  it("should not approve sender if evidence does not match the correct ID", async () => {
    const signers = await ethers.getSigners();

    const deployer = signers[1];
    const admin = signers[2];
    const signer1 = signers[3];
    const aprAdmin = signers[4];

    const correctID = ethers.BigNumber.from(ethers.utils.randomBytes(32));
    const badID = ethers.BigNumber.from(ethers.utils.randomBytes(32));

    const stateConfig: StateConfigStruct = {
      // prettier-ignore
      sources: [
          op(Opcode.CONTEXT, 0),
          op(Opcode.CONSTANT, 0),
        op(Opcode.EQUAL_TO),
      ],
      constants: [correctID],
    };

    const autoApprove = await autoApproveDeploy(
      deployer,
      autoApproveFactory,
      stateConfig
    );

    const verifyFactory = await verifyFactoryDeploy();
    const verify = await verifyDeploy(deployer, verifyFactory, {
      admin: admin.address,
      callback: autoApprove.address,
    });

    const evidenceAdd = hexlify(badID);

    // make AutoApprove an approver
    await verify
      .connect(admin)
      .grantRole(await verify.APPROVER_ADMIN(), aprAdmin.address);
    await verify
      .connect(admin)
      .renounceRole(await verify.APPROVER_ADMIN(), admin.address);
    await verify
      .connect(aprAdmin)
      .grantRole(await verify.APPROVER(), autoApprove.address);

    // signer1 attempts to get their account auto approved
    const addTx = await verify.connect(signer1).add(evidenceAdd);

    await assertError(
      async () =>
        (await getEventArgs(addTx, "Approve", verify)) as ApproveEvent["args"],
      "Could not find event Approve",
      "wrongly approved when automatic approval should have been denied"
    );
  });

  it("should automatically approve sender if evidence matches the correct ID", async () => {
    const signers = await ethers.getSigners();

    const deployer = signers[1];
    const admin = signers[2];
    const signer1 = signers[3];
    const aprAdmin = signers[4];

    const correctID = ethers.BigNumber.from(ethers.utils.randomBytes(32));

    const stateConfig: StateConfigStruct = {
      // prettier-ignore
      sources: [
          op(Opcode.CONTEXT, 0),
          op(Opcode.CONSTANT, 0),
        op(Opcode.EQUAL_TO),
      ],
      constants: [correctID],
    };

    const autoApprove = await autoApproveDeploy(
      deployer,
      autoApproveFactory,
      stateConfig
    );

    const verifyFactory = await verifyFactoryDeploy();
    const verify = await verifyDeploy(deployer, verifyFactory, {
      admin: admin.address,
      callback: autoApprove.address,
    });

    const evidenceAdd = hexlify(correctID);

    // Can't approve without permissions
    await assertError(
      async () => await verify.connect(signer1).add(evidenceAdd),
      `AccessControl: account ${autoApprove.address.toLowerCase()} is missing role ${(
        await verify.APPROVER()
      ).toLowerCase()}`,
      "autoApprove approved without approver role"
    );

    // make AutoApprove an approver
    await verify
      .connect(admin)
      .grantRole(await verify.APPROVER_ADMIN(), aprAdmin.address);
    await verify
      .connect(admin)
      .renounceRole(await verify.APPROVER_ADMIN(), admin.address);
    await verify
      .connect(aprAdmin)
      .grantRole(await verify.APPROVER(), autoApprove.address);

    // now signer1 can get their account automatically approved
    const addTx = await verify.connect(signer1).add(evidenceAdd);

    const { sender, evidence } = (await getEventArgs(
      addTx,
      "Approve",
      verify
    )) as ApproveEvent["args"];

    assert(sender === autoApprove.address, "wrong approve sender");
    assert(evidence.account === signer1.address, "wrong evidence account");
    assert(evidence.data === evidenceAdd, "wrong evidence data");
  });

  it("should trigger afterAdd callback and automatically deny approval of sender when VM script returns 0", async () => {
    const signers = await ethers.getSigners();

    const deployer = signers[1];
    const admin = signers[2];
    const signer1 = signers[3];
    const aprAdmin = signers[4];

    const stateConfig: StateConfigStruct = {
      sources: [op(Opcode.CONSTANT, 0)],
      constants: [0], // do not approve any evidence
    };

    const autoApprove = await autoApproveDeploy(
      deployer,
      autoApproveFactory,
      stateConfig
    );

    const verifyFactory = await verifyFactoryDeploy();
    const verify = await verifyDeploy(deployer, verifyFactory, {
      admin: admin.address,
      callback: autoApprove.address,
    });

    const evidenceAdd = hexZeroPad([...Buffer.from("Evidence")], 32);

    // make AutoApprove an approver
    await verify
      .connect(admin)
      .grantRole(await verify.APPROVER_ADMIN(), aprAdmin.address);
    await verify
      .connect(admin)
      .renounceRole(await verify.APPROVER_ADMIN(), admin.address);
    await verify
      .connect(aprAdmin)
      .grantRole(await verify.APPROVER(), autoApprove.address);

    // signer1 attempts to get their account auto approved
    const addTx = await verify.connect(signer1).add(evidenceAdd);

    await assertError(
      async () =>
        (await getEventArgs(addTx, "Approve", verify)) as ApproveEvent["args"],
      "Could not find event Approve",
      "wrongly approved when automatic approval should have been denied"
    );
  });

  it("should trigger afterAdd callback and automatically approve sender when VM script returns 1", async () => {
    const signers = await ethers.getSigners();

    const deployer = signers[1];
    const admin = signers[2];
    const signer1 = signers[3];
    const aprAdmin = signers[4];

    const stateConfig: StateConfigStruct = {
      sources: [op(Opcode.CONSTANT, 0)],
      constants: [1], // approve any evidence
    };

    const autoApprove = await autoApproveDeploy(
      deployer,
      autoApproveFactory,
      stateConfig
    );

    const verifyFactory = await verifyFactoryDeploy();
    const verify = await verifyDeploy(deployer, verifyFactory, {
      admin: admin.address,
      callback: autoApprove.address,
    });

    const evidenceAdd = hexZeroPad([...Buffer.from("Evidence")], 32);

    // Can't approve without permissions
    assertError(
      async () => await verify.connect(signer1).add(evidenceAdd),
      `AccessControl: account ${autoApprove.address.toLowerCase()} is missing role ${(
        await verify.APPROVER()
      ).toLowerCase()}`,
      "autoApprove approved without approver role"
    );

    // make AutoApprove an approver
    await verify
      .connect(admin)
      .grantRole(await verify.APPROVER_ADMIN(), aprAdmin.address);
    await verify
      .connect(admin)
      .renounceRole(await verify.APPROVER_ADMIN(), admin.address);
    await verify
      .connect(aprAdmin)
      .grantRole(await verify.APPROVER(), autoApprove.address);

    // now signer1 can get their account automatically approved
    const addTx = await verify.connect(signer1).add(evidenceAdd);

    const { sender, evidence } = (await getEventArgs(
      addTx,
      "Approve",
      verify
    )) as ApproveEvent["args"];

    assert(sender === autoApprove.address, "wrong approve sender");
    assert(evidence.account === signer1.address, "wrong evidence account");
    assert(evidence.data === evidenceAdd, "wrong evidence data");
  });
});
