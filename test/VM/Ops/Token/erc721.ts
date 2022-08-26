import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { StandardIntegrity } from "../../../../typechain/StandardIntegrity";
import { AllStandardOpsTest } from "../../../../typechain/AllStandardOpsTest";
import { ReserveTokenERC721 } from "../../../../typechain/ReserveTokenERC721";
import { basicDeploy } from "../../../../utils/deploy/basic";
import { AllStandardOps } from "../../../../utils/rainvm/ops/allStandardOps";
import { op, memoryOperand, MemoryType } from "../../../../utils/rainvm/vm";

const Opcode = AllStandardOps;

let signers: SignerWithAddress[];
let signer0: SignerWithAddress;
let signer1: SignerWithAddress;

let tokenERC721: ReserveTokenERC721;

describe("RainVM ERC721 ops", async function () {
  let integrity: StandardIntegrity;
  let logic: AllStandardOpsTest;

  before(async () => {
    const integrityFactory = await ethers.getContractFactory(
      "StandardIntegrity"
    );
    integrity = (await integrityFactory.deploy()) as StandardIntegrity;
    await integrity.deployed();

    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
    logic = (await logicFactory.deploy(
      integrity.address
    )) as AllStandardOpsTest;
  });

  beforeEach(async () => {
    signers = await ethers.getSigners();
    signer0 = signers[0];
    signer1 = signers[1];

    tokenERC721 = (await basicDeploy(
      "ReserveTokenERC721",
      {}
    )) as ReserveTokenERC721;

    await tokenERC721.initialize();
  });

  it("should return owner of specific ERC721 token", async () => {
    const nftId = 0;

    const constants = [nftId, tokenERC721.address];
    const vNftId = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vTokenAddr = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

    // prettier-ignore
    const sources = [
      concat([
          vTokenAddr,
          vNftId,
        op(Opcode.IERC721_OWNER_OF)
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
    const result0 = await logic.stackTop();
    assert(result0.eq(signer0.address));

    await tokenERC721.transferFrom(signer0.address, signer1.address, nftId);

    await logic.run();
    const result1 = await logic.stackTop();
    assert(result1.eq(signer1.address));
  });

  it("should return ERC721 balance of signer", async () => {
    const constants = [signer1.address, tokenERC721.address];
    const vSigner1 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vTokenAddr = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

    // prettier-ignore
    const sources = [
      concat([
          vTokenAddr,
          vSigner1,
        op(Opcode.IERC721_BALANCE_OF)
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
    const result0 = await logic.stackTop();
    assert(result0.isZero(), `expected 0, got ${result0}`);

    await tokenERC721.transferFrom(signer0.address, signer1.address, 0);

    await logic.run();
    const result1 = await logic.stackTop();
    assert(result1.eq(1), `expected 1, got ${result1}`);

    await tokenERC721.mintNewToken();
    await tokenERC721.transferFrom(signer0.address, signer1.address, 1);

    await logic.run();
    const result2 = await logic.stackTop();
    assert(result2.eq(2), `expected 2, got ${result2}`);
  });
});
