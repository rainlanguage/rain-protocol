import { concat, hexZeroPad } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { AutoApprove, CloneFactory } from "../../../../typechain";
import {
  ApproveEvent,
  Verify,
} from "../../../../typechain/contracts/verify/Verify";
import { basicDeploy } from "../../../../utils";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import {
  autoApproveCloneDeploy,
  autoApproveImplementation,
} from "../../../../utils/deploy/verify/auto/autoApprove/deploy";
import {
  verifyCloneDeploy,
  verifyImplementation,
} from "../../../../utils/deploy/verify/deploy";
import { getEventArgs } from "../../../../utils/events";
import { timewarp } from "../../../../utils/hardhat";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils/interpreter/interpreter";
import { RainterpreterOps } from "../../../../utils/interpreter/ops/allStandardOps";
import { assertError } from "../../../../utils/test/assertError";

const Opcode = RainterpreterOps;

const FALSE = () =>
  op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0));
const TRUE = () =>
  op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1));

describe("AutoApprove evidence data approved", async function () {
  let implementAutoApprove: AutoApprove;
  let implementVerify: Verify;
  let cloneFactory: CloneFactory;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementAutoApprove = await autoApproveImplementation();
    implementVerify = await verifyImplementation();

    //Deploy Clone Factory
    cloneFactory = (await basicDeploy("CloneFactory", {})) as CloneFactory;
  });

  it("should allow checking if the given evidence e.g. approval time is after a given timestamp (e.g. 1 day in the past), and allowing it to be reused for another approval", async () => {
    const signers = await ethers.getSigners();

    const [, deployer, admin, aprAdmin, signer1, signer2, signer3] = signers;

    const expressionConfig = {
      // prettier-ignore
      sources: [
        concat([
            // has this evidence been used before?
                op(Opcode.context, 0x0001),
              op(Opcode.hash, 1),
            op(Opcode.get),

            // has it been 1 day since this evidence was last used for approval?
                  op(Opcode.context, 0x0001),
                op(Opcode.hash, 1),
              op(Opcode.get),
                op(Opcode.block_timestamp),
                op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)), // 1 day in seconds
              op(Opcode.sub, 2),
            op(Opcode.less_than),

            // else, set new evidence and return true
                op(Opcode.context, 0x0001),
              op(Opcode.hash, 1), // k
              op(Opcode.block_timestamp), // v
            op(Opcode.set),
            TRUE(),

          op(Opcode.eager_if),
        ])],
      constants: [0, 1, 86400],
    };

    const autoApprove = await autoApproveCloneDeploy(
      deployer,
      cloneFactory,
      implementAutoApprove,
      deployer,
      expressionConfig.sources,
      expressionConfig.constants
    );

    const verify = await verifyCloneDeploy(
      deployer,
      cloneFactory,
      implementVerify,
      admin.address,
      autoApprove.address
    );

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

    const [, deployer, admin, aprAdmin, signer1] = signers;

    const expressionConfig = {
      // prettier-ignore
      sources: [
        // approved ? deny : approve
        concat([
                op(Opcode.context, 0x0001),
              op(Opcode.hash, 1),
            op(Opcode.get),

            FALSE(), // deny

                op(Opcode.context, 0x0001),
              op(Opcode.hash, 1), // k
              TRUE(), // v
            op(Opcode.set),
            TRUE(), // approve

          op(Opcode.eager_if),
        ])],
      constants: [0, 1],
    };

    const autoApprove = await autoApproveCloneDeploy(
      deployer,
      cloneFactory,
      implementAutoApprove,
      deployer,
      expressionConfig.sources,
      expressionConfig.constants
    );

    const verify = await verifyCloneDeploy(
      deployer,
      cloneFactory,
      implementVerify,
      admin.address,
      autoApprove.address
    );

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
    const addTx0 = await verify
      .connect(signer1)
      .add(evidenceAdd, { gasLimit: 1000000 });

    // Approve event should exist
    (await getEventArgs(addTx0, "Approve", verify)) as ApproveEvent["args"];

    // // now attempt to approve another signer with same evidence
    // const addTx1 = await verify.connect(signer2).add(evidenceAdd);

    // // Approve event should not exist
    // await assertError(
    //   async () =>
    //     (await getEventArgs(addTx1, "Approve", verify)) as ApproveEvent["args"],
    //   "Could not find event Approve",
    //   "wrongly approved when evidence was reused"
    // );
  });
});
