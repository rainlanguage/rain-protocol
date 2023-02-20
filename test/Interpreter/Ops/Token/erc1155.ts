import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { ethers } from "hardhat";
import type {
  IInterpreterV1Consumer,
  Rainterpreter,
  ReserveTokenERC1155,
} from "../../../../typechain";
import { basicDeploy } from "../../../../utils/deploy/basicDeploy";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { standardEvaluableConfig } from "../../../../utils/interpreter/interpreter";

let signers: SignerWithAddress[];
let signer0: SignerWithAddress;
let signer1: SignerWithAddress;
let signer2: SignerWithAddress;

let tokenERC1155: ReserveTokenERC1155;

describe("RainInterpreter ERC1155 ops", async function () {
  let rainInterpreter: Rainterpreter;
  let logic: IInterpreterV1Consumer;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);
    rainInterpreter = await rainterpreterDeploy();

    const consumerFactory = await ethers.getContractFactory(
      "IInterpreterV1Consumer"
    );
    logic = (await consumerFactory.deploy()) as IInterpreterV1Consumer;
    await logic.deployed();
  });

  beforeEach(async () => {
    signers = await ethers.getSigners();
    [signer0, signer1, signer2] = signers;

    tokenERC1155 = (await basicDeploy(
      "ReserveTokenERC1155",
      {}
    )) as ReserveTokenERC1155;
    await tokenERC1155.initialize();
  });

  it("should return ERC1155 batch balance result for multiple signers", async () => {
    const tokenId = 0;

    const { sources, constants } = standardEvaluableConfig(
      `_ _: erc-1155-balance-of-batch(
        ${tokenERC1155.address}
        ${signer1.address}
        ${signer2.address}
        ${tokenId}
        ${tokenId}
      );`
    );

    const expression0 = await expressionConsumerDeploy(
      sources,
      constants,
      rainInterpreter,
      2
    );

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

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
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

    const { sources, constants } = standardEvaluableConfig(
      `_: erc-1155-balance-of(${tokenERC1155.address} ${signer1.address} ${tokenId});`
    );

    const expression0 = await expressionConsumerDeploy(
      sources,
      constants,
      rainInterpreter,
      1
    );
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
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

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result1 = await logic.stackTop();
    assert(
      result1.eq(transferAmount),
      `expected ${transferAmount} of id ${tokenId}, got ${result1}`
    );
  });
});
