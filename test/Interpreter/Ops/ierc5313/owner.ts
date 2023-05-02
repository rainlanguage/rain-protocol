import { strict as assert } from "assert";
import { ethers } from "hardhat";
import type {
  IInterpreterV1Consumer,
  Rainterpreter,
  ReserveTokenOwner,
} from "../../../../typechain";
import { basicDeploy } from "../../../../utils/deploy/basicDeploy";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { opMetaHash, standardEvaluableConfig } from "../../../../utils/interpreter/interpreter";
import { rainlang } from "../../../../utils/extensions/rainlang";

let tokenWithOwner: ReserveTokenOwner;

describe("RainInterpreter EIP5313 ops", async function () {
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
    tokenWithOwner = (await basicDeploy(
      "ReserveTokenOwner",
      {}
    )) as ReserveTokenOwner;
    await tokenWithOwner.initialize();
  });

  it("should return owner", async () => {
    const signers = await ethers.getSigners();

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
        @${opMetaHash}
_: erc-5313-owner(${tokenWithOwner.address});`
    );
    console.log(sources, constants);
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

    assert(
      result0.toHexString().toLowerCase() == signers[0].address.toLowerCase(),
      `Not Owner`
    );
  });

  it("should return updated owner", async () => {
    const signers = await ethers.getSigners();
    const signer2 = signers[2];

    const { sources: sources0, constants: constants0 } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
_: erc-5313-owner(${tokenWithOwner.address});`
      );

    const expression0 = await expressionConsumerDeploy(
      sources0,
      constants0,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result0 = await logic.stackTop();

    assert(
      result0.toHexString().toLowerCase() == signers[0].address.toLowerCase(),
      `Not Owner`
    );

    // Update Owner
    await tokenWithOwner.connect(signers[0]).transferOwnerShip(signer2.address);

    const { sources: sources1, constants: constants1 } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}
_: erc-5313-owner(${tokenWithOwner.address});`
      );

    const expression1 = await expressionConsumerDeploy(
      sources1,
      constants1,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression1.dispatch,
      []
    );
    const result1 = await logic.stackTop();

    assert(
      result1.toHexString().toLowerCase() == signer2.address.toLowerCase(),
      `Owner Not Updated`
    );
  });
});
