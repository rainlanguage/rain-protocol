import { concat, hexZeroPad } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { StateConfigStruct } from "../../../../typechain/AutoApprove";
import { AutoApproveFactory } from "../../../../typechain/AutoApproveFactory";
import { ReserveTokenERC721 } from "../../../../typechain/ReserveTokenERC721";
import { ApproveEvent } from "../../../../typechain/Verify";
import {
  autoApproveDeploy,
  autoApproveFactoryDeploy,
} from "../../../../utils/deploy/autoApprove";
import { basicDeploy } from "../../../../utils/deploy/basic";
import {
  verifyDeploy,
  verifyFactoryDeploy,
} from "../../../../utils/deploy/verify";
import { getEventArgs } from "../../../../utils/events";
import { Opcode } from "../../../../utils/rainvm/ops/autoApproveOps";
import { op } from "../../../../utils/rainvm/vm";

describe("AutoApprove ERC721 ownership", async function () {
  let autoApproveFactory: AutoApproveFactory;
  let tokenERC721: ReserveTokenERC721;

  before(async () => {
    autoApproveFactory = await autoApproveFactoryDeploy();
  });

  beforeEach(async () => {
    tokenERC721 = (await basicDeploy(
      "ReserveTokenERC721",
      {}
    )) as ReserveTokenERC721;
  });

  it("should automatically approve only if sender owns the NFT", async () => {
    const signers = await ethers.getSigners();

    const signer0 = signers[0];
    const deployer = signers[1];
    const admin = signers[2];
    const aprAdmin = signers[3];
    const signer1 = signers[4];

    const vTokenAddr = op(Opcode.CONSTANT, 0);
    const cNftId = op(Opcode.CONTEXT, 0);

    const stateConfig: StateConfigStruct = {
      // prettier-ignore
      sources: [
        concat([
              vTokenAddr,
              cNftId,
            op(Opcode.IERC721_OWNER_OF),
            op(Opcode.SENDER),
          op(Opcode.EQUAL_TO),
        ])],
      constants: [tokenERC721.address],
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
    const evidenceAdd0 = hexZeroPad([1], 32);
    const addTx0 = await verify.connect(signer1).add(evidenceAdd0);
    (await getEventArgs(addTx0, "Approve", verify)) as ApproveEvent["args"];
  });
});
