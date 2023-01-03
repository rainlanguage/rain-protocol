import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  IInterpreterV1Consumer,
  Rainterpreter,
  ReserveToken,
} from "../../../../typechain";
import { basicDeploy } from "../../../../utils/deploy/basicDeploy";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../../utils/interpreter/ops/allStandardOps";

const Opcode = AllStandardOps;

let signers: SignerWithAddress[];
let signer1: SignerWithAddress;

let tokenERC20: ReserveToken;

describe("RainInterpreter ERC20 ops", async function () {
  let rainInterpreter: Rainterpreter;
  let logic: IInterpreterV1Consumer;

  before(async () => {
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
    const constants = [tokenERC20.address];
    const vTokenAddr = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );

    // prettier-ignore
    const sources = [
      concat([
          vTokenAddr,
        op(Opcode.ERC20_TOTAL_SUPPLY)
      ]),
    ];

    const expression0 = await expressionConsumerDeploy(
      {
        sources,
        constants,
      },
      rainInterpreter,
      1
    );

    await logic.eval(rainInterpreter.address, expression0.dispatch, []);
    const result0 = await logic.stackTop();
    const totalTokenSupply = await tokenERC20.totalSupply();
    assert(
      result0.eq(totalTokenSupply),
      `expected ${totalTokenSupply}, got ${result0}`
    );
  });

  it("should return ERC20 balance", async () => {
    const constants = [signer1.address, tokenERC20.address];
    const vSigner1 = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vTokenAddr = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );

    // prettier-ignore
    const sources = [
      concat([
          vTokenAddr,
          vSigner1,
        op(Opcode.ERC20_BALANCE_OF)
      ]),
    ];

    const expression0 = await expressionConsumerDeploy(
      {
        sources,
        constants,
      },
      rainInterpreter,
      1
    );
    await logic.eval(rainInterpreter.address, expression0.dispatch, []);
    const result0 = await logic.stackTop();
    assert(result0.isZero(), `expected 0, got ${result0}`);

    await tokenERC20.transfer(signer1.address, 100);

    await logic.eval(rainInterpreter.address, expression0.dispatch, []);
    const result1 = await logic.stackTop();
    assert(result1.eq(100), `expected 100, got ${result1}`);
  });
});
