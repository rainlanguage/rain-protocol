import { concat, hexZeroPad } from "ethers/lib/utils";
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
import { timewarp } from "../../../../utils/hardhat";
import { Opcode } from "../../../../utils/rainvm/ops/autoApproveOps";
import { op, memoryOperand, MemoryType } from "../../../../utils/rainvm/vm";
import { assertError } from "../../../../utils/test/assertError";

describe("AutoApprove evidence data approved op", async function () {
  let autoApproveFactory: AutoApproveFactory;

  before(async () => {
    autoApproveFactory = await autoApproveFactoryDeploy();
  });

  it("should allow checking if the given evidence e.g. approval time is after a given timestamp (e.g. 1 day in the past), and allowing it to be reused for another approval", async () => {
    const signers = await ethers.getSigners();

    const deployer = signers[1];
    const admin = signers[2];
    const aprAdmin = signers[3];
    const signer1 = signers[4];
    const signer2 = signers[5];
    const signer3 = signers[6];

    const stateConfig: StateConfigStruct = {
      // prettier-ignore
      sources: [
        concat([
            // has this evidence been used before?
            op(Opcode.CONTEXT, 1),
            op(Opcode.EVIDENCE_DATA_APPROVED),

            // has it been 1 day since this evidence was last used for approval?
            op(Opcode.CONTEXT, 1),
              op(Opcode.EVIDENCE_DATA_APPROVED),
                op(Opcode.BLOCK_TIMESTAMP),
                op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)), // 1 day in seconds
              op(Opcode.SUB, 2),
            op(Opcode.LESS_THAN),

            // else, allow any new evidence
            op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),

          op(Opcode.EAGER_IF),
        ])],
      constants: [0, 1, 86400],
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

    await autoApprove.connect(deployer).transferOwnership(verify.address);

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

    // now signer1 can get their account automatically approved
    const addTx0 = await verify.connect(signer1).add(evidenceAdd);

    // Approve event should exist
    (await getEventArgs(addTx0, "Approve", verify)) as ApproveEvent["args"];

    // now attempt to approve another signer with same evidence, immediately
    const addTx1 = await verify.connect(signer2).add(evidenceAdd);

    // Approve event should not exist
    await assertError(
      async () =>
        (await getEventArgs(addTx1, "Approve", verify)) as ApproveEvent["args"],
      "Could not find event Approve",
      "wrongly approved when same evidence was reused immediately"
    );

    await timewarp(86500); // advance at least a day

    // now signer2 can get their account automatically approved
    const addTx2 = await verify.connect(signer2).add(evidenceAdd);

    // Approve event should exist
    (await getEventArgs(addTx2, "Approve", verify)) as ApproveEvent["args"];

    // now attempt to approve another signer with same evidence, immediately
    // this means that `_approvedEvidenceData[evidenceData_]` was overwritten in `addTx2`
    const addTx3 = await verify.connect(signer3).add(evidenceAdd);

    // Approve event should not exist
    await assertError(
      async () =>
        (await getEventArgs(addTx3, "Approve", verify)) as ApproveEvent["args"],
      "Could not find event Approve",
      "wrongly approved when same evidence was reused immediately"
    );
  });

  it("should allow checking if the given evidence e.g. has already been used in a prior approval, preventing the same evidence being used twice", async () => {
    const signers = await ethers.getSigners();

    const deployer = signers[1];
    const admin = signers[2];
    const aprAdmin = signers[3];
    const signer1 = signers[4];
    const signer2 = signers[5];

    const stateConfig: StateConfigStruct = {
      // prettier-ignore
      sources: [
        // approved ? deny : approve
        concat([
          op(Opcode.CONTEXT, 1),
            op(Opcode.EVIDENCE_DATA_APPROVED),
            op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)), // deny
            op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // approve
          op(Opcode.EAGER_IF),
        ])],
      constants: [0, 1],
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

    await autoApprove.connect(deployer).transferOwnership(verify.address);

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

    // now signer1 can get their account automatically approved
    const addTx0 = await verify.connect(signer1).add(evidenceAdd);

    // Approve event should exist
    (await getEventArgs(addTx0, "Approve", verify)) as ApproveEvent["args"];

    // now attempt to approve another signer with same evidence
    const addTx1 = await verify.connect(signer2).add(evidenceAdd);

    // Approve event should not exist
    await assertError(
      async () =>
        (await getEventArgs(addTx1, "Approve", verify)) as ApproveEvent["args"],
      "Could not find event Approve",
      "wrongly approved when evidence was reused"
    );
  });
});
