import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { max_uint256 } from "../../../utils/constants";
import { claimFactoriesDeploy } from "../../../utils/deploy/claim";
import { emissionsDeploy } from "../../../utils/deploy/emissions";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { op } from "../../../utils/rainvm/vm";
import { assertError } from "../../../utils/test/assertError";

export const Opcode = AllStandardOps;

describe("EmissionsERC20 calculateClaim unchecked math", async function () {
  it("should panic when accumulator overflows with exponentiation op", async () => {
    const constants = [max_uint256.div(2), 2];

    const vHalfMaxUInt256 = op(Opcode.CONSTANT, 0);
    const vTwo = op(Opcode.CONSTANT, 1);

    // prettier-ignore
    const source0 = concat([
        vHalfMaxUInt256,
        vTwo,
      op(Opcode.EXP, 2)
    ]);

    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimer = signers[1];

    const { emissionsERC20Factory } = await claimFactoriesDeploy();

    const emissionsERC20 = await emissionsDeploy(
      creator,
      emissionsERC20Factory,
      {
        allowDelegatedClaims: true,
        erc20Config: {
          name: "Emissions",
          symbol: "EMS",
          distributor: signers[0].address,
          initialSupply: 0,
        },
        vmStateConfig: {
          sources: [source0],
          constants,
        },
      }
    );

    await assertError(
      async () => await emissionsERC20.calculateClaim(claimer.address),
      "Arithmetic operation underflowed or overflowed outside of an unchecked block",
      "accumulator overflow did not panic"
    );
  });

  it("should panic when accumulator overflows with multiplication op", async () => {
    const constants = [max_uint256.div(2), 3];

    const vHalfMaxUInt256 = op(Opcode.CONSTANT, 0);
    const vThree = op(Opcode.CONSTANT, 1);

    // prettier-ignore
    const source0 = concat([
        vHalfMaxUInt256,
        vThree,
      op(Opcode.MUL, 2)
    ]);

    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimer = signers[1];

    const { emissionsERC20Factory } = await claimFactoriesDeploy();

    const emissionsERC20 = await emissionsDeploy(
      creator,
      emissionsERC20Factory,
      {
        allowDelegatedClaims: true,
        erc20Config: {
          name: "Emissions",
          symbol: "EMS",
          distributor: signers[0].address,
          initialSupply: 0,
        },
        vmStateConfig: {
          sources: [source0],
          constants,
        },
      }
    );

    await assertError(
      async () => await emissionsERC20.calculateClaim(claimer.address),
      "Transaction reverted",
      "accumulator overflow did not panic"
    );
  });

  it("should panic when accumulator underflows with subtraction op", async () => {
    const constants = [0, 1];

    const vZero = op(Opcode.CONSTANT, 0);
    const vOne = op(Opcode.CONSTANT, 1);

    // prettier-ignore
    const source0 = concat([
        vZero,
        vOne,
      op(Opcode.SUB, 2)
    ]);

    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimer = signers[1];

    const { emissionsERC20Factory } = await claimFactoriesDeploy();

    const emissionsERC20 = await emissionsDeploy(
      creator,
      emissionsERC20Factory,
      {
        allowDelegatedClaims: true,
        erc20Config: {
          name: "Emissions",
          symbol: "EMS",
          distributor: signers[0].address,
          initialSupply: 0,
        },
        vmStateConfig: {
          sources: [source0],
          constants,
        },
      }
    );

    await assertError(
      async () => await emissionsERC20.calculateClaim(claimer.address),
      "Transaction reverted",
      "accumulator underflow did not panic"
    );
  });

  it("should panic when accumulator overflows with addition op", async () => {
    const constants = [max_uint256, 1];

    const vMaxUInt256 = op(Opcode.CONSTANT, 0);
    const vOne = op(Opcode.CONSTANT, 1);

    // prettier-ignore
    const source0 = concat([
        vMaxUInt256,
        vOne,
      op(Opcode.ADD, 2)
    ]);

    const signers = await ethers.getSigners();
    const creator = signers[0];
    const claimer = signers[1];

    const { emissionsERC20Factory } = await claimFactoriesDeploy();

    const emissionsERC20 = await emissionsDeploy(
      creator,
      emissionsERC20Factory,
      {
        allowDelegatedClaims: true,
        erc20Config: {
          name: "Emissions",
          symbol: "EMS",
          distributor: signers[0].address,
          initialSupply: 0,
        },
        vmStateConfig: {
          sources: [source0],
          constants,
        },
      }
    );

    await assertError(
      async () => await emissionsERC20.calculateClaim(claimer.address),
      "Transaction reverted",
      "accumulator overflow did not panic"
    );
  });
});
