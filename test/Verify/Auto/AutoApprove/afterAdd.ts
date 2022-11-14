import { assert } from "chai";
import { concat, hexZeroPad } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { AutoApproveFactory, VerifyFactory } from "../../../../typechain";
import { StateConfigStruct } from "../../../../typechain/contracts/verify/auto/AutoApprove";
import { ApproveEvent } from "../../../../typechain/contracts/verify/Verify";
import {
  autoApproveDeploy,
  autoApproveFactoryDeploy,
} from "../../../../utils/deploy/verify/auto/autoApprove/deploy";
import {
  verifyDeploy,
  verifyFactoryDeploy,
} from "../../../../utils/deploy/verify/deploy";
import { getEventArgs } from "../../../../utils/events";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils/interpreter/interpreter";
import { Opcode } from "../../../../utils/interpreter/ops/autoApproveOps";
import { assertError } from "../../../../utils/test/assertError";

describe("AutoApprove afterAdd", async function () {
  let autoApproveFactory: AutoApproveFactory;
  let verifyFactory: VerifyFactory;

  before(async () => {
    autoApproveFactory = await autoApproveFactoryDeploy();
    verifyFactory = await verifyFactoryDeploy();
  });

  it("should automatically approve sender iff AutoApprove has APPROVER role", async () => {
    const signers = await ethers.getSigners();

    const deployer = signers[1];
    const admin = signers[2];
    const signer1 = signers[3];
    const aprAdmin = signers[4];

    const correctID = hexZeroPad(ethers.utils.randomBytes(32), 32);

    const stateConfig: StateConfigStruct = {
      // prettier-ignore
      sources: [
        concat([
          op(Opcode.CONTEXT, 0x0001),
            op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.EQUAL_TO),
        ]),
      ],
      constants: [correctID],
    };

    const autoApprove = await autoApproveDeploy(
      deployer,
      autoApproveFactory,
      stateConfig
    );

    const verify = await verifyDeploy(deployer, verifyFactory, {
      admin: admin.address,
      callback: autoApprove.address,
    });

    await autoApprove.connect(deployer).transferOwnership(verify.address);

    const evidenceAdd = hexZeroPad(correctID, 32);

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
    await verify.connect(signer1).add(evidenceAdd);
  });

  it("should not approve sender if evidence does not match the correct ID", async () => {
    const signers = await ethers.getSigners();

    const deployer = signers[1];
    const admin = signers[2];
    const signer1 = signers[3];
    const aprAdmin = signers[4];

    const correctID = hexZeroPad(ethers.utils.randomBytes(32), 32);
    const badID = hexZeroPad(ethers.utils.randomBytes(32), 32);

    const stateConfig: StateConfigStruct = {
      // prettier-ignore
      sources: [
        concat([
          op(Opcode.CONTEXT, 0x0001),
            op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.EQUAL_TO),
        ]),
      ],
      constants: [correctID],
    };

    const autoApprove = await autoApproveDeploy(
      deployer,
      autoApproveFactory,
      stateConfig
    );

    const verify = await verifyDeploy(deployer, verifyFactory, {
      admin: admin.address,
      callback: autoApprove.address,
    });

    const deployOwner = await autoApprove.owner();
    assert(
      deployOwner === deployer.address,
      `deployer is not auto approve owner is ${deployOwner} expected ${deployer.address}`
    );

    await autoApprove.connect(deployer).transferOwnership(verify.address);

    const evidenceAdd = hexZeroPad(badID, 32);

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

    const correctID = hexZeroPad(ethers.utils.randomBytes(32), 32);

    const stateConfig: StateConfigStruct = {
      // prettier-ignore
      sources: [
        concat([
          op(Opcode.CONTEXT, 0x0001),
            op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.EQUAL_TO),
        ]),
      ],
      constants: [correctID],
    };

    const autoApprove = await autoApproveDeploy(
      deployer,
      autoApproveFactory,
      stateConfig
    );

    const verify = await verifyDeploy(deployer, verifyFactory, {
      admin: admin.address,
      callback: autoApprove.address,
    });

    await autoApprove.connect(deployer).transferOwnership(verify.address);

    const evidenceAdd = hexZeroPad(correctID, 32);

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

  it("should trigger afterAdd callback and automatically deny approval of sender when Interpreter script returns 0", async () => {
    const signers = await ethers.getSigners();

    const deployer = signers[1];
    const admin = signers[2];
    const signer1 = signers[3];
    const aprAdmin = signers[4];

    const stateConfig: StateConfigStruct = {
      sources: [op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0))],
      constants: [0], // do not approve any evidence
    };

    const autoApprove = await autoApproveDeploy(
      deployer,
      autoApproveFactory,
      stateConfig
    );

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

  it("should trigger afterAdd callback and automatically approve sender when Interpreter script returns 1", async () => {
    const signers = await ethers.getSigners();

    const deployer = signers[1];
    const admin = signers[2];
    const signer1 = signers[3];
    const aprAdmin = signers[4];

    const stateConfig: StateConfigStruct = {
      sources: [op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0))],
      constants: [1], // approve any evidence
    };

    const autoApprove = await autoApproveDeploy(
      deployer,
      autoApproveFactory,
      stateConfig
    );

    const verify = await verifyDeploy(deployer, verifyFactory, {
      admin: admin.address,
      callback: autoApprove.address,
    });

    await autoApprove.connect(deployer).transferOwnership(verify.address);

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
