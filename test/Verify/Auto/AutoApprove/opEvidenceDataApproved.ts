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
import { Opcode } from "../../../../utils/rainvm/ops/autoApproveOps";
import { op } from "../../../../utils/rainvm/vm";
import { assertError } from "../../../../utils/test/assertError";

describe("AutoApprove evidence data approved op", async function () {
  let autoApproveFactory: AutoApproveFactory;

  before(async () => {
    autoApproveFactory = await autoApproveFactoryDeploy();
  });

  it("should allow checking if the given evidence has already been used in a prior approval, preventing the same evidence being used twice", async () => {
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
              op(Opcode.CONTEXT, 0),
            op(Opcode.EVIDENCE_DATA_APPROVED),
            op(Opcode.CONSTANT, 0), // deny
            op(Opcode.CONSTANT, 1), // approve
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
