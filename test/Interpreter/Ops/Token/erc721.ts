import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { ethers } from "hardhat";
import type {
  IInterpreterV1Consumer,
  Rainterpreter,
  ReserveTokenERC721,
} from "../../../../typechain";
import { basicDeploy } from "../../../../utils/deploy/basicDeploy";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { standardEvaluableConfig } from "../../../../utils/interpreter/interpreter";
import { rainlang } from "../../../../utils/extensions/rainlang";

let signers: SignerWithAddress[];
let signer0: SignerWithAddress;
let signer1: SignerWithAddress;

let tokenERC721: ReserveTokenERC721;

describe("RainInterpreter ERC721 ops", async function () {
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
    [signer0, signer1] = signers;

    tokenERC721 = (await basicDeploy(
      "ReserveTokenERC721",
      {}
    )) as ReserveTokenERC721;

    await tokenERC721.initialize();
  });

  it("should return owner of specific ERC721 token", async () => {
    const nftId = 0;
    const { sources, constants } = await standardEvaluableConfig(
      rainlang`_: erc-721-owner-of(${tokenERC721.address} ${nftId});`
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
    assert(result0.eq(signer0.address));

    await tokenERC721.transferFrom(signer0.address, signer1.address, nftId);

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result1 = await logic.stackTop();
    assert(result1.eq(signer1.address));
  });

  it("should return ERC721 balance of signer", async () => {
    const { sources, constants } = await standardEvaluableConfig(
      rainlang`_: erc-721-balance-of(${tokenERC721.address} ${signer1.address});`
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
    assert(result0.isZero(), `expected 0, got ${result0}`);

    await tokenERC721.transferFrom(signer0.address, signer1.address, 0);

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result1 = await logic.stackTop();
    assert(result1.eq(1), `expected 1, got ${result1}`);

    await tokenERC721.mintNewToken();
    await tokenERC721.transferFrom(signer0.address, signer1.address, 1);

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result2 = await logic.stackTop();
    assert(result2.eq(2), `expected 2, got ${result2}`);
  });
});
