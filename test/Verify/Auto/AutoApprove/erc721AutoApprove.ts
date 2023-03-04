import { concat, hexZeroPad } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  AutoApprove,
  CloneFactory,
  ReserveTokenERC721,
} from "../../../../typechain";
import {
  ApproveEvent,
  Verify,
} from "../../../../typechain/contracts/verify/Verify";
import { basicDeploy } from "../../../../utils/deploy/basicDeploy";
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
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils/interpreter/interpreter";
import { Opcode } from "../../../../utils/interpreter/ops/allStandardOps";

describe("AutoApprove ERC721 ownership", async function () {
  let tokenERC721: ReserveTokenERC721;
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

  beforeEach(async () => {
    tokenERC721 = (await basicDeploy(
      "ReserveTokenERC721",
      {}
    )) as ReserveTokenERC721;
  });

  it("should automatically approve only if account owns the NFT", async () => {
    const signers = await ethers.getSigners();

    const [signer0, deployer, admin, signer1, aprAdmin] = signers;

    const vTokenAddr = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const cAccount = op(Opcode.context, 0x0000);
    const cNftId = op(Opcode.context, 0x0001);

    const expressionConfig = {
      // prettier-ignore
      sources: [
        concat([
              vTokenAddr,
              cNftId,
            op(Opcode.erc_721_owner_of),
            cAccount,
          op(Opcode.equal_to),
        ])],
      constants: [tokenERC721.address],
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

    // signer1 acquires NFT with id 1
    await tokenERC721.mintNewToken();
    await tokenERC721.transferFrom(signer0.address, signer1.address, 1);
    const evidenceAdd0 = hexZeroPad("0x1", 32);
    const addTx0 = await verify.connect(signer1).add(evidenceAdd0);
    (await getEventArgs(addTx0, "Approve", verify)) as ApproveEvent["args"];
  });
});
