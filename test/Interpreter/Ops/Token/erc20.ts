import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { ethers } from "hardhat";
import type {
  IInterpreterV1Consumer,
  Rainterpreter,
  ReserveToken,
} from "../../../../typechain";
import { basicDeploy } from "../../../../utils/deploy/basicDeploy";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { standardEvaluableConfig } from "../../../../utils/interpreter/interpreter";

let signers: SignerWithAddress[];
let signer1: SignerWithAddress;

let tokenERC20: ReserveToken;

describe("RainInterpreter ERC20 ops", async function () {
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
    signer1 = signers[1];

    tokenERC20 = (await basicDeploy("ReserveToken", {})) as ReserveToken;
    await tokenERC20.initialize();
  });

  it("should return ERC20 total supply", async () => {
    const { sources, constants } = await standardEvaluableConfig(
      `_: erc-20-total-supply(${tokenERC20.address});`
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
    const totalTokenSupply = await tokenERC20.totalSupply();
    assert(
      result0.eq(totalTokenSupply),
      `expected ${totalTokenSupply}, got ${result0}`
    );
  });

  it("should return ERC20 balance", async () => {
    const { sources, constants } = await standardEvaluableConfig(
      `_: erc-20-balance-of(${tokenERC20.address} ${signer1.address});`
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

    await tokenERC20.transfer(signer1.address, 100);

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result1 = await logic.stackTop();
    assert(result1.eq(100), `expected 100, got ${result1}`);
  });
});
