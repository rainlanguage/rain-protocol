import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  AllStandardOpsTest,
  ReserveTokenERC1155,
  StandardIntegrity,
} from "../../../../typechain";
import { basicDeploy } from "../../../../utils/deploy/basicDeploy";
import { AllStandardOps } from "../../../../utils/interpreter/ops/allStandardOps";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils/interpreter/interpreter";

const Opcode = AllStandardOps;

let signers: SignerWithAddress[];
let signer0: SignerWithAddress;
let signer1: SignerWithAddress;
let signer2: SignerWithAddress;

let tokenERC1155: ReserveTokenERC1155;

describe("RainInterpreter ERC1155 ops", async function () {
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
    signer2 = signers[2];

    tokenERC1155 = (await basicDeploy(
      "ReserveTokenERC1155",
      {}
    )) as ReserveTokenERC1155;
    await tokenERC1155.initialize();
  });

  it("should return ERC1155 batch balance result for multiple signers", async () => {
    const tokenId = 0;
    const length = 2;

    const constants = [
      signer1.address,
      signer2.address,
      tokenERC1155.address,
      tokenId,
    ];
    const vSigner1 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vSigner2 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const vTokenAddr = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const vTokenId = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));

    // prettier-ignore
    const sources = [
      concat([
          vTokenAddr,
          vSigner1,
          vSigner2,
          vTokenId,
          vTokenId,
        op(Opcode.IERC1155_BALANCE_OF_BATCH, length)
      ]),
    ];

    await logic.initialize({ sources, constants });

    const transferAmount = 100;

    await tokenERC1155.safeTransferFrom(
      signer0.address,
      signer1.address,
      tokenId,
      transferAmount,
      []
    );
    await tokenERC1155.safeTransferFrom(
      signer0.address,
      signer2.address,
      tokenId,
      transferAmount * 2,
      []
    );

    const nativeBatchAmounts = await tokenERC1155.balanceOfBatch(
      [signer1.address, signer2.address],
      [tokenId, tokenId]
    );

    await logic.run();
    const opBatchAmounts = await logic.stack();

    assert(
      nativeBatchAmounts.every((nativeAmount, i) =>
        nativeAmount.eq(opBatchAmounts[i])
      ),
      "balanceOfBatch op result does not match result from native call"
    );
  });

  it("should return ERC1155 balance of signer", async () => {
    const tokenId = 0;

    const constants = [signer1.address, tokenERC1155.address, tokenId];
    const vSigner1 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vTokenAddr = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const vTokenId = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));

    // prettier-ignore
    const sources = [
      concat([
          vTokenAddr,
          vSigner1,
          vTokenId,
        op(Opcode.IERC1155_BALANCE_OF)
      ]),
    ];

    await logic.initialize({ sources, constants });
    await logic.run();
    const result0 = await logic.stackTop();
    assert(result0.isZero(), `expected 0 of id ${tokenId}, got ${result0}`);

    const transferAmount = 100;

    await tokenERC1155.safeTransferFrom(
      signer0.address,
      signer1.address,
      tokenId,
      transferAmount,
      []
    );

    const signer1Balance = await tokenERC1155.balanceOf(
      signer1.address,
      tokenId
    );

    // just checking erc1155 logic
    assert(
      signer1Balance.eq(transferAmount),
      `wrong signer1Balance
      expected  ${transferAmount}
      got       ${signer1Balance}`
    );

    await logic.run();
    const result1 = await logic.stackTop();
    assert(
      result1.eq(transferAmount),
      `expected ${transferAmount} of id ${tokenId}, got ${result1}`
    );
  });
});
