import { assert } from "chai";
import { BytesLike, concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import {
  assertError,
  max_uint256,
  memoryOperand,
  MemoryType,
  op,
  Opcode,
  randomUint256,
  standardEvaluableConfig,
} from "../../../../utils";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import OpHash from "../../../../contracts/interpreter/ops/crypto/OpHash.opmeta.json";
import { constructByBits, OperandArgs } from "rainlang";

describe("HASH Opcode test", async function () {
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

  // get array of a particualr length
  const getArrayOfLength = (length: number) => {
    let arr = [];
    for (let i = 0; i < length; i++) {
      arr.push(randomUint256());
    }
    return arr;
  };

  // get a int between min and max inclusive
  const randomIntFromInterval = (min: number, max: number) => {
    return Math.floor(Math.random() * (max - min + 1) + min);
  };

  // build source array from constants array
  const buildSources = (constants: Array<number>, op_: number | number[]) => {
    let soruceArray = [];
    for (let i = 0; i < constants.length; i++) {
      soruceArray.push(
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, i))
      );
    }
    soruceArray.push(op(Opcode.hash, op_));
    let sources = concat(soruceArray);
    return sources;
  };

  it("should build operand from array of fuzzed? operand values ", async () => {
    for (let i = 0; i < 30; i++) {
      // get random value for range
      let range = randomIntFromInterval(1, 300);

      let operandArgs: OperandArgs = [
        {
          name: "",
          bits: [0, 7],
          validRange: [[1, range]],
        },
      ];

      // array of values that will be build as a single operand
      let values = [range];
      const constants = getArrayOfLength(range);

      // Constructing arguments for the constructByBits function
      // ref resolveOp method of rain parser
      let constructArgs = operandArgs.map((e, i) => {
        return {
          value: values[i],
          bits: e.bits,
          computation: e.computation,
          validRange: e.validRange,
        };
      });

      // getting the operand
      let op_ = constructByBits(constructArgs);
      let source = buildSources(constants, op_);

      // Case if operand is zero
      if (op_[0] === 0) {
        await assertError(
          async () =>
            await expressionConsumerDeploy(
              [source],
              constants,
              rainInterpreter,
              1
            ),
          "OperandUnderflow",
          "Underflow"
        );
      } else if (op_[0] > 255) {
        // Case if operand is greater than enforced length

        await assertError(
          async () =>
            await expressionConsumerDeploy(
              [source],
              constants,
              rainInterpreter,
              1
            ),
          "OperandOverflow",
          "Overflow"
        );
      } else {
        const expression0 = await expressionConsumerDeploy(
          [source],
          constants,
          rainInterpreter,
          1
        );

        await logic["eval(address,uint256,uint256[][])"](
          rainInterpreter.address,
          expression0.dispatch,
          []
        );
        const result = await logic.stackTop();

        const expectedValue = ethers.utils.solidityKeccak256(
          ["uint256[]"],
          [constants]
        );

        assert(
          result.eq(expectedValue),
          `Invalid output, expected ${expectedValue}, actual ${result}`
        );
      }
    }
  });
});
