import { assert } from "chai";
import { concat, hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  CloneFactory,
  IInterpreterV1Consumer,
  Rainterpreter,
  Verify,
} from "../../typechain";

import * as Util from "../../utils";
import {
  AllStandardOps,
  basicDeploy,
  getBlockTimestamp,
  op,
  verifyCloneDeploy,
  verifyImplementation,
  
} from "../../utils";
import { rainterpreterDeploy } from "../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../utils/deploy/test/iinterpreterV1Consumer/deploy";

const Opcode = AllStandardOps;

describe("IVERIFYV1_ACCOUNT_STATUS_AT_TIME Opcode test", async function () {
  const ONE_SECOND = 1;

  let implementVerify: Verify
  let cloneFactory: CloneFactory
  let rainInterpreter: Rainterpreter;
  let logic: IInterpreterV1Consumer;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementVerify = await verifyImplementation()

    //Deploy Clone Factory
    cloneFactory = (await basicDeploy("CloneFactory",{})) as CloneFactory
    rainInterpreter = await rainterpreterDeploy();

    const consumerFactory = await ethers.getContractFactory(
      "IInterpreterV1Consumer"
    );
    logic = (await consumerFactory.deploy()) as IInterpreterV1Consumer;
    await logic.deployed();
  });

  it("should correctly verify tier", async function () {
    const signers = await ethers.getSigners();
    const admin = signers[0];
    const verifier = signers[1];
    const signer1 = signers[2];
    const newAdmin = signers[3];

    // Deploying verifiy contract
    const verify = await verifyCloneDeploy(
cloneFactory ,  
implementVerify , 
admin.address,
 ethers.constants.AddressZero
    );

    // prettier-ignore
    const source = concat([
        op(Opcode.context, 0x0000), // CONTRACT
        op(Opcode.context, 0x0001), // ADDRESS
        op(Opcode.context, 0x0002), // TIMESTAMP
      op(Opcode.iverify_v1_account_status_at_time), // STATUS
    ]);

    const expression0 = await expressionConsumerDeploy(
      [source],
      [],
      rainInterpreter,
      1
    );

    await verify.grantRole(await verify.APPROVER_ADMIN(), newAdmin.address);
    await verify.grantRole(await verify.BANNER_ADMIN(), newAdmin.address);
    await verify.grantRole(await verify.REMOVER_ADMIN(), newAdmin.address);

    const verifyNewAdmin = verify.connect(newAdmin);
    await verifyNewAdmin.grantRole(
      await verifyNewAdmin.APPROVER(),
      verifier.address
    );
    await verifyNewAdmin.grantRole(
      await verifyNewAdmin.BANNER(),
      verifier.address
    );
    await verifyNewAdmin.grantRole(
      await verifyNewAdmin.REMOVER(),
      verifier.address
    );

    let timestamp = await getBlockTimestamp();
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      [[verify.address, signer1.address, timestamp]]
    );
    assert(
      (await logic.stackTop()).eq(Util.STATUS_NIL),
      "Incorrect status when no action is performed [STATUS_NIL]"
    );

    const evidenceAdd = hexlify([...Buffer.from("Evidence for add")]);
    const evidenceApprove = hexlify([...Buffer.from("Evidence for approve")]);
    const evidenceBan = hexlify([...Buffer.from("Evidence for ban")]);

    // Adding evidence
    await verify.connect(signer1).add(evidenceAdd);

    timestamp = await getBlockTimestamp();

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      [[verify.address, signer1.address, timestamp - ONE_SECOND]]
    );

    console.log(await logic.stackTop());
    console.log((await logic.stackTop()).eq(Util.STATUS_ADDED));
    // Checking status before 'add'
    assert(
      (await logic.stackTop()).eq(Util.STATUS_NIL),
      "Incorrect status before adding an evidence, [STATUS_NIL] expected"
    );

    // Checking status after 'add'
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      [[verify.address, signer1.address, timestamp]]
    );
    assert(
      (await logic.stackTop()).eq(Util.STATUS_ADDED),
      "Incorrect status after adding an evidence [STATUS_ADDED]"
    );

    // Approve
    await verify
      .connect(verifier)
      .approve([{ account: signer1.address, data: evidenceApprove }]);

    timestamp = await getBlockTimestamp();

    // Checking status before 'approve'
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      [[verify.address, signer1.address, timestamp - ONE_SECOND]]
    );
    assert(
      (await logic.stackTop()).eq(Util.STATUS_ADDED),
      "Incorrect status before adding an evidence [STATUS_ADDED] expected"
    );
    // Checking status after 'approve'
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      [[verify.address, signer1.address, timestamp]]
    );
    assert(
      (await logic.stackTop()).eq(Util.STATUS_APPROVED),
      "Incorrect status after approving an evidence [STATUS_APPROVED]"
    );

    // Ban
    await verify
      .connect(verifier)
      .ban([{ account: signer1.address, data: evidenceBan }]);

    timestamp = await getBlockTimestamp();

    // Checking status before 'ban'
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      [[verify.address, signer1.address, timestamp - ONE_SECOND]]
    );
    assert(
      (await logic.stackTop()).eq(Util.STATUS_APPROVED),
      "Incorrect status before adding an evidence [STATUS_APPROVED] expected"
    );

    // Checking status after 'ban'
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      [[verify.address, signer1.address, timestamp]]
    );
    assert(
      (await logic.stackTop()).eq(Util.STATUS_BANNED),
      "Incorrect status after banning an address [STATUS_BANNED]"
    );
  });
});
