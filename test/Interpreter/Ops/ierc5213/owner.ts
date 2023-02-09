import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  IInterpreterV1Consumer,
  Rainterpreter,
  ReserveTokenOwner,
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

let tokenERC20: ReserveTokenOwner;

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
    tokenERC20 = (await basicDeploy(
      "ReserveTokenOwner",
      {}
    )) as ReserveTokenOwner;
    await tokenERC20.initialize();
  });

  it("should return owner", async () => {
    const signers = await ethers.getSigners();
    const constants = [tokenERC20.address];

    // prettier-ignore
    const sources = [
      concat([
        op(Opcode.readMemory,memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.erc5313Owner)
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
    const constants = [tokenERC20.address];

    // prettier-ignore
    const sources0 = [
      concat([
        op(Opcode.readMemory,memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.erc5313Owner)
      ]),
    ];

    const expression0 = await expressionConsumerDeploy(
      {
        sources: sources0,
        constants,
      },
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
    await tokenERC20.connect(signers[0]).transferOwnerShip(signer2.address);

    // prettier-ignore
    const sources1 = [
      concat([
        op(Opcode.readMemory,memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.erc5313Owner)
      ]),
    ];

    const expression1 = await expressionConsumerDeploy(
      {
        sources: sources1,
        constants,
      },
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
