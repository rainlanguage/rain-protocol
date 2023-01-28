import { assert } from "chai";
import { ethers } from "hardhat";
import {
  Rainterpreter,
  RainterpreterExpressionDeployer,
  ReserveToken,
  StakeFactory,
} from "../../typechain";
import {
  InitializeEvent,
  StakeConfigStruct,
} from "../../typechain/contracts/stake/Stake";
import {
  max_uint16,
  max_uint256,
  memoryOperand,
  MemoryType,
  op,
  Opcode,
} from "../../utils";
import { zeroAddress } from "../../utils/constants/address";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import { rainterpreterDeploy } from "../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployerDeploy } from "../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import { stakeDeploy } from "../../utils/deploy/stake/deploy";
import { stakeFactoryDeploy } from "../../utils/deploy/stake/stakeFactory/deploy";
import { getEventArgs } from "../../utils/events";
import { assertError } from "../../utils/test/assertError";
import { compareStructs } from "../../utils/test/compareStructs";

describe("Stake construction", async function () {
  let stakeFactory: StakeFactory;
  let token: ReserveToken;
  let interpreter: Rainterpreter;
  let expressionDeployer: RainterpreterExpressionDeployer;

  before(async () => {
    stakeFactory = await stakeFactoryDeploy();
    interpreter = await rainterpreterDeploy();
    expressionDeployer = await rainterpreterExpressionDeployerDeploy(
      interpreter
    );
  });

  beforeEach(async () => {
    token = (await basicDeploy("ReserveToken", {})) as ReserveToken;
  });

  it("should not initialize if requirements not met", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const constants = [max_uint256, max_uint16];

    const max_deposit = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );

    const source = [max_deposit, max_withdraw];

    const stakeConfigStructZeroToken: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: zeroAddress,
      expressionDeployer: expressionDeployer.address,
      interpreter: interpreter.address,
      expressionConfig: {
        sources: source,
        constants: constants,
      },
    };

    await assertError(
      async () =>
        await stakeDeploy(deployer, stakeFactory, stakeConfigStructZeroToken),
      "ZeroAsset()",
      "wrongly initialised Stake with token configured as 0 address"
    );
  });

  it("should initialize correctly on the good path", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const constants = [max_uint256, max_uint16];

    const max_deposit = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );

    const source = [max_deposit, max_withdraw];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      expressionDeployer: expressionDeployer.address,
      interpreter: interpreter.address,
      expressionConfig: {
        sources: source,
        constants: constants,
      },
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    const { sender, config } = (await getEventArgs(
      stake.deployTransaction,
      "Initialize",
      stake
    )) as InitializeEvent["args"];

    assert(sender === stakeFactory.address, "wrong sender in Initialize event");

    compareStructs(config, stakeConfigStruct);
  });
});
