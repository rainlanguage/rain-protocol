import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { ReadWriteTier } from "../../../typechain";
import { ReserveToken } from "../../../typechain";
import { SaleFactory } from "../../../typechain";
import { zeroAddress } from "../../../utils/constants/address";
import {
  max_uint256,
  ONE,
  RESERVE_ONE,
} from "../../../utils/constants/bigNumber";
import { basicDeploy } from "../../../utils/deploy/basic";
import { saleDependenciesDeploy, saleDeploy } from "../../../utils/deploy/sale";
import { createEmptyBlock } from "../../../utils/hardhat";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import { betweenBlockNumbersSource } from "../../../utils/interpreter/sale";
import {
  op,
  memoryOperand,
  MemoryType,
} from "../../../utils/interpreter/interpreter";
import { assertError } from "../../../utils/test/assertError";
import { Tier } from "../../../utils/types/tier";

const Opcode = AllStandardOps;

describe("Sale unchecked math", async function () {
  let reserve: ReserveToken,
    readWriteTier: ReadWriteTier,
    saleFactory: SaleFactory,
    signers: SignerWithAddress[];

  before(async () => {
    ({ readWriteTier, saleFactory } = await saleDependenciesDeploy());
  });

  beforeEach(async () => {
    signers = await ethers.getSigners();

    reserve = (await basicDeploy("ReserveToken", {})) as ReserveToken;
  });

  it("should panic when accumulator overflows with exponentiation op", async () => {
    const deployer = signers[0];
    const recipient = signers[1];

    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleDuration = 30;
    const minimumRaise = ethers.BigNumber.from("100000").mul(RESERVE_ONE);

    const totalTokenSupply = ethers.BigNumber.from("2000").mul(ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: zeroAddress,
      initialSupply: totalTokenSupply,
    };

    const constants = [
      max_uint256.div(2),
      2,
      startBlock - 1,
      startBlock + saleDuration - 1,
    ];

    const vHalfMaxUInt256 = op(
      Opcode.STATE,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vTwo = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const vStart = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const vEnd = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));

    // prettier-ignore
    const source0 = concat([
      op(Opcode.CONTEXT),
        vHalfMaxUInt256,
        vTwo,
      op(Opcode.EXP, 2)
    ]);

    const sources = [betweenBlockNumbersSource(vStart, vEnd), source0];

    const [sale] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        interpreterStateConfig: {
          sources,
          constants,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration: 1,
        minimumRaise,
        dustSize: 0,
        saleTimeout: 100,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: zeroAddress,
      }
    );

    // wait until sale start
    await createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.start();

    const desiredUnits = totalTokenSupply;

    await assertError(
      async () => await sale.calculateBuy(desiredUnits),
      "Error",
      "accumulator overflow did not panic"
    );
  });

  it("should panic when accumulator overflows with multiplication op", async () => {
    const deployer = signers[0];
    const recipient = signers[1];

    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleDuration = 30;
    const minimumRaise = ethers.BigNumber.from("100000").mul(RESERVE_ONE);

    const totalTokenSupply = ethers.BigNumber.from("2000").mul(ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: zeroAddress,
      initialSupply: totalTokenSupply,
    };

    const constants = [
      max_uint256.div(2),
      3,
      startBlock - 1,
      startBlock + saleDuration - 1,
    ];

    const vHalfMaxUInt256 = op(
      Opcode.STATE,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vThree = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const vStart = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const vEnd = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));

    // prettier-ignore
    const source0 = concat([
      op(Opcode.CONTEXT),
        vHalfMaxUInt256,
        vThree,
      op(Opcode.MUL, 2)
    ]);

    const sources = [betweenBlockNumbersSource(vStart, vEnd), source0];

    const [sale] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        interpreterStateConfig: {
          sources,
          constants,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration: 1,
        minimumRaise,
        dustSize: 0,
        saleTimeout: 100,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: zeroAddress,
      }
    );

    // wait until sale start
    await createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.start();

    const desiredUnits = totalTokenSupply;

    await assertError(
      async () => await sale.calculateBuy(desiredUnits),
      "Error",
      "accumulator overflow did not panic"
    );
  });

  it("should panic when accumulator underflows with subtraction op", async () => {
    const deployer = signers[0];
    const recipient = signers[1];

    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleDuration = 30;
    const minimumRaise = ethers.BigNumber.from("100000").mul(RESERVE_ONE);

    const totalTokenSupply = ethers.BigNumber.from("2000").mul(ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: zeroAddress,
      initialSupply: totalTokenSupply,
    };

    const constants = [0, 1, startBlock - 1, startBlock + saleDuration - 1];

    const vZero = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vOne = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const vStart = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const vEnd = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));

    // prettier-ignore
    const source0 = concat([
      op(Opcode.CONTEXT),
        vZero,
        vOne,
      op(Opcode.SUB, 2)
    ]);

    const sources = [betweenBlockNumbersSource(vStart, vEnd), source0];

    const [sale] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        interpreterStateConfig: {
          sources,
          constants,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration: 1,
        minimumRaise,
        dustSize: 0,
        saleTimeout: 100,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: zeroAddress,
      }
    );

    // wait until sale start
    await createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.start();

    const desiredUnits = totalTokenSupply;

    await assertError(
      async () => await sale.calculateBuy(desiredUnits),
      "Error",
      "accumulator underflow did not panic"
    );
  });

  it("should panic when accumulator overflows with addition op", async () => {
    const deployer = signers[0];
    const recipient = signers[1];

    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleDuration = 30;
    const minimumRaise = ethers.BigNumber.from("100000").mul(RESERVE_ONE);

    const totalTokenSupply = ethers.BigNumber.from("2000").mul(ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: zeroAddress,
      initialSupply: totalTokenSupply,
    };

    const constants = [
      max_uint256,
      1,
      startBlock - 1,
      startBlock + saleDuration - 1,
    ];

    const vMaxUInt256 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vOne = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const vStart = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const vEnd = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));

    // prettier-ignore
    const source0 = concat([
      op(Opcode.CONTEXT),
        vMaxUInt256,
        vOne,
      op(Opcode.ADD, 2)
    ]);

    const sources = [betweenBlockNumbersSource(vStart, vEnd), source0];

    const [sale] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        interpreterStateConfig: {
          sources,
          constants,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration: 1,
        minimumRaise,
        dustSize: 0,
        saleTimeout: 100,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: zeroAddress,
      }
    );

    // wait until sale start
    await createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.start();

    const desiredUnits = totalTokenSupply;

    await assertError(
      async () => await sale.calculateBuy(desiredUnits),
      "Error",
      "accumulator overflow did not panic"
    );
  });
});
