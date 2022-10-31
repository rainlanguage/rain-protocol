import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  Rainterpreter,
  RainterpreterExpressionDeployer,
  ReadWriteTier,
  ReserveToken,
  SaleFactory,
} from "../../typechain";
import { BuyEvent } from "../../typechain/contracts/sale/Sale";
import { zeroAddress } from "../../utils/constants/address";
import {
  fourZeros,
  ONE,
  RESERVE_ONE,
  sixteenZeros,
} from "../../utils/constants/bigNumber";
import {
  saleDependenciesDeploy,
  saleDeploy,
} from "../../utils/deploy/sale/deploy";
import { reserveDeploy } from "../../utils/deploy/test/reserve/deploy";
import { getEventArgs } from "../../utils/events";
import { createEmptyBlock } from "../../utils/hardhat";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../utils/interpreter/ops/allStandardOps";
import { betweenBlockNumbersSource } from "../../utils/interpreter/sale";
import { assertError } from "../../utils/test/assertError";
import { SaleStorage } from "../../utils/types/sale";
import { Tier } from "../../utils/types/tier";

const Opcode = AllStandardOps;

describe("Sale calculate price", async function () {
  let reserve: ReserveToken,
    readWriteTier: ReadWriteTier,
    saleFactory: SaleFactory,
    interpreter: Rainterpreter,
    expressionDeployer: RainterpreterExpressionDeployer;

  before(async () => {
    ({ readWriteTier, saleFactory, interpreter, expressionDeployer } =
      await saleDependenciesDeploy());
  });

  beforeEach(async () => {
    reserve = await reserveDeploy();
  });

  it("should dynamically calculate price (discount off base price based on proportion of ERC20 token currently held by buyer)", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const feeRecipient = signers[2];
    const signer1 = signers[3];
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
    const basePrice = ethers.BigNumber.from("100").mul(RESERVE_ONE);
    const balanceMultiplier = ethers.BigNumber.from("100").mul(RESERVE_ONE);
    const constants = [
      basePrice,
      balanceMultiplier,
      startBlock - 1,
      startBlock + saleDuration - 1,
    ];
    const vBasePrice = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vFractionMultiplier = op(
      Opcode.STATE,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vStart = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const vEnd = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    // prettier-ignore
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([
        // maxUnits
        op(Opcode.CONTEXT, 0x0000),
        // price
          vBasePrice,
              vFractionMultiplier,
                op(Opcode.STORAGE, SaleStorage.Token),
                op(Opcode.SENDER),
              op(Opcode.ERC20_BALANCE_OF),
            op(Opcode.MUL, 2),
              op(Opcode.STORAGE, SaleStorage.Token),
            op(Opcode.ERC20_TOTAL_SUPPLY),
          op(Opcode.DIV, 2),
        op(Opcode.SUB, 2),
      ]),
    ];
    const [sale, token] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
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
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );
    const fee = ethers.BigNumber.from("1").mul(RESERVE_ONE);
    // wait until sale start
    await createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );
    await sale.start();
    const signer1Balance0 = await token.balanceOf(signer1.address);
    const desiredUnits0 = totalTokenSupply.div(10);
    const expectedPrice0 = basePrice.sub(
      signer1Balance0.mul(balanceMultiplier).div(totalTokenSupply)
    );
    const expectedCost0 = expectedPrice0.mul(desiredUnits0).div(ONE);
    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, expectedCost0.add(fee));
    await reserve
      .connect(signer1)
      .approve(sale.address, expectedCost0.add(fee));
    // buy 10% of total supply
    const txBuy0 = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnits0,
      desiredUnits: desiredUnits0,
      maximumPrice: expectedPrice0,
    });
    const { receipt: receipt0 } = (await getEventArgs(
      txBuy0,
      "Buy",
      sale
    )) as BuyEvent["args"];
    assert(
      receipt0.price.eq(expectedPrice0),
      `wrong dynamic price0
      expected  ${expectedPrice0}
      got       ${receipt0.price}`
    );
    const signer1Balance1 = await token.balanceOf(signer1.address);
    const desiredUnits1 = totalTokenSupply.div(10);
    const expectedPrice1 = basePrice.sub(
      signer1Balance1.mul(balanceMultiplier).div(totalTokenSupply)
    );
    const expectedCost1 = expectedPrice1.mul(desiredUnits1).div(ONE);
    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, expectedCost1.add(fee));
    await reserve
      .connect(signer1)
      .approve(sale.address, expectedCost1.add(fee));
    // buy another 10% of total supply
    const txBuy1 = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnits1,
      desiredUnits: desiredUnits1,
      maximumPrice: expectedPrice1,
    });
    const { receipt: receipt1 } = (await getEventArgs(
      txBuy1,
      "Buy",
      sale
    )) as BuyEvent["args"];
    assert(
      receipt1.price.eq(expectedPrice1),
      `wrong dynamic price1
      expected  ${expectedPrice1}
      got       ${receipt1.price}`
    );
  });

  it("should dynamically calculate price (discount off base price based on proportion of ERC20 reserve currently held by buyer)", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const feeRecipient = signers[2];
    const signer1 = signers[3];
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
    const basePrice = ethers.BigNumber.from("100").mul(RESERVE_ONE);
    const balanceMultiplier = ethers.BigNumber.from("100").mul(RESERVE_ONE);
    const constants = [
      basePrice,
      balanceMultiplier,
      startBlock - 1,
      startBlock + saleDuration - 1,
    ];
    const vBasePrice = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vFractionMultiplier = op(
      Opcode.STATE,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vStart = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const vEnd = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    // prettier-ignore
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([
        // maxUnits
        op(Opcode.CONTEXT, 0x0000),
        // price
          vBasePrice,
              vFractionMultiplier,
                op(Opcode.STORAGE, SaleStorage.Reserve),
                op(Opcode.SENDER),
              op(Opcode.ERC20_BALANCE_OF),
            op(Opcode.MUL, 2),
              op(Opcode.STORAGE, SaleStorage.Reserve),
            op(Opcode.ERC20_TOTAL_SUPPLY),
          op(Opcode.DIV, 2),
        op(Opcode.SUB, 2),
      ]),
    ];
    const [sale] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
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
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );
    const fee = ethers.BigNumber.from("1").mul(RESERVE_ONE);
    // wait until sale start
    await createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );
    await sale.start();
    const totalReserve = await reserve.totalSupply();
    // signer1 holds 10% of reserve, should get 10% off base price
    await reserve.transfer(signer1.address, totalReserve.div(10));
    const signer1Balance0 = await reserve.balanceOf(signer1.address);
    const desiredUnits0 = totalTokenSupply.div(10);
    const expectedPrice0 = basePrice.sub(
      signer1Balance0.mul(balanceMultiplier).div(totalReserve)
    );
    const expectedCost0 = expectedPrice0.mul(desiredUnits0).div(ONE);
    await reserve
      .connect(signer1)
      .approve(sale.address, expectedCost0.add(fee));
    // buy 10% of total supply
    const txBuy0 = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnits0,
      desiredUnits: desiredUnits0,
      maximumPrice: expectedPrice0,
    });
    const { receipt: receipt0 } = (await getEventArgs(
      txBuy0,
      "Buy",
      sale
    )) as BuyEvent["args"];
    assert(
      receipt0.price.eq(expectedPrice0),
      `wrong dynamic price0
      expected  ${expectedPrice0}
      got       ${receipt0.price}`
    );
    const signer1Balance1 = await reserve.balanceOf(signer1.address);
    const desiredUnits1 = totalTokenSupply.div(10);
    const expectedPrice1 = basePrice.sub(
      signer1Balance1.mul(balanceMultiplier).div(totalReserve)
    );
    const expectedCost1 = expectedPrice1.mul(desiredUnits1).div(ONE);
    await reserve
      .connect(signer1)
      .approve(sale.address, expectedCost1.add(fee));
    // buy another 10% of total supply
    const txBuy1 = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnits1,
      desiredUnits: desiredUnits1,
      maximumPrice: expectedPrice1,
    });
    const { receipt: receipt1 } = (await getEventArgs(
      txBuy1,
      "Buy",
      sale
    )) as BuyEvent["args"];
    assert(
      receipt1.price.eq(expectedPrice1),
      `wrong dynamic price1
      expected  ${expectedPrice1}
      got       ${receipt1.price}`
    );
  });

  it("should prevent out of bounds opcode call", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleDuration = 30;
    const minimumRaise = ethers.BigNumber.from("100000").mul(RESERVE_ONE);
    const totalTokenSupply = ethers.BigNumber.from("2000").mul(ONE);
    const dustSize = totalTokenSupply.div(10 ** 7); // arbitrary value
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: zeroAddress,
      initialSupply: totalTokenSupply,
    };
    const constants = [startBlock - 1, startBlock + saleDuration - 1];
    const vStart = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vEnd = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const sources = [betweenBlockNumbersSource(vStart, vEnd), concat([op(99)])]; // bad source
    await assertError(
      async () =>
        await saleDeploy(
          signers,
          deployer,
          saleFactory,
          {
            interpreter: interpreter.address,
            expressionDeployer: expressionDeployer.address,
            interpreterStateConfig: {
              sources,
              constants,
            },
            recipient: recipient.address,
            reserve: reserve.address,
            cooldownDuration: 1,
            minimumRaise,
            dustSize,
            saleTimeout: 100,
          },
          {
            erc20Config: redeemableERC20Config,
            tier: readWriteTier.address,
            minimumTier: Tier.ZERO,
            distributionEndForwardingAddress: ethers.constants.AddressZero,
          }
        ),
      "Error",
      "did not prevent out of bounds opcode deploy"
    );
  });

  it("should dynamically calculate price (based on number of units being bought)", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const feeRecipient = signers[2];
    const signer1 = signers[3];
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
    const basePrice = ethers.BigNumber.from("75").mul(RESERVE_ONE);
    const supplyDivisor = ethers.BigNumber.from("1" + sixteenZeros);
    const constants = [
      basePrice,
      supplyDivisor,
      startBlock - 1,
      startBlock + saleDuration - 1,
    ];
    const vBasePrice = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vSupplyDivisor = op(
      Opcode.STATE,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vStart = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const vEnd = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([
        // maxUnits
        op(Opcode.CONTEXT, 0x0000),
        // price
        // ((CURRENT_BUY_UNITS priceDivisor /) 75 +)
        op(Opcode.CONTEXT, 0x0000),
        vSupplyDivisor,
        op(Opcode.DIV, 2),
        vBasePrice,
        op(Opcode.ADD, 2),
      ]),
    ];
    const [sale] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
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
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );
    const fee = ethers.BigNumber.from("1").mul(RESERVE_ONE);
    // wait until sale start
    await createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );
    await sale.start();
    const desiredUnits0 = totalTokenSupply.div(10);
    const expectedPrice0 = basePrice.add(desiredUnits0.div(supplyDivisor));
    const expectedCost0 = expectedPrice0.mul(desiredUnits0).div(ONE);
    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, expectedCost0.add(fee));
    await reserve
      .connect(signer1)
      .approve(sale.address, expectedCost0.add(fee));
    // buy 10% of total supply
    const txBuy0 = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnits0,
      desiredUnits: desiredUnits0,
      maximumPrice: expectedPrice0,
    });
    const { receipt: receipt0 } = (await getEventArgs(
      txBuy0,
      "Buy",
      sale
    )) as BuyEvent["args"];
    assert(
      receipt0.price.eq(expectedPrice0),
      `wrong dynamic price0
      expected  ${expectedPrice0}
      got       ${receipt0.price}`
    );
    const desiredUnits1 = totalTokenSupply.div(10);
    const expectedPrice1 = basePrice.add(desiredUnits1.div(supplyDivisor));
    const expectedCost1 = expectedPrice1.mul(desiredUnits1).div(ONE);
    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, expectedCost1.add(fee));
    await reserve
      .connect(signer1)
      .approve(sale.address, expectedCost1.add(fee));
    // buy another 10% of total supply
    const txBuy1 = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnits1,
      desiredUnits: desiredUnits1,
      maximumPrice: expectedPrice1,
    });
    const { receipt: receipt1 } = (await getEventArgs(
      txBuy1,
      "Buy",
      sale
    )) as BuyEvent["args"];
    assert(
      receipt1.price.eq(expectedPrice1),
      `wrong dynamic price1
      expected  ${expectedPrice1}
      got       ${receipt1.price}`
    );
  });

  it("should dynamically calculate price (based on total reserve in)", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const feeRecipient = signers[2];
    const signer1 = signers[3];
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
    const basePrice = ethers.BigNumber.from("75").mul(RESERVE_ONE);
    const reserveDivisor = ethers.BigNumber.from("1" + fourZeros);
    const constants = [
      basePrice,
      reserveDivisor,
      startBlock - 1,
      startBlock + saleDuration - 1,
    ];
    const vBasePrice = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vReserveDivisor = op(
      Opcode.STATE,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vStart = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const vEnd = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([
        // maxUnits
        op(Opcode.CONTEXT, 0x0000),
        // price
        // ((TOTAL_RESERVE_IN reserveDivisor /) 75 +)
        op(Opcode.STORAGE, SaleStorage.TotalReserveIn),
        vReserveDivisor,
        op(Opcode.DIV, 2),
        vBasePrice,
        op(Opcode.ADD, 2),
      ]),
    ];
    const [sale] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
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
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );
    const fee = ethers.BigNumber.from("1").mul(RESERVE_ONE);
    // wait until sale start
    await createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );
    await sale.start();
    const desiredUnits0 = totalTokenSupply.div(10);
    const expectedPrice0 = basePrice.add(0);
    const expectedCost0 = expectedPrice0.mul(desiredUnits0).div(ONE);
    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, expectedCost0.add(fee));
    await reserve
      .connect(signer1)
      .approve(sale.address, expectedCost0.add(fee));
    // buy 10% of total supply
    const txBuy0 = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnits0,
      desiredUnits: desiredUnits0,
      maximumPrice: expectedPrice0,
    });
    const { receipt: receipt0 } = (await getEventArgs(
      txBuy0,
      "Buy",
      sale
    )) as BuyEvent["args"];
    assert(
      receipt0.price.eq(expectedPrice0),
      `wrong dynamic price0
      expected  ${expectedPrice0}
      got       ${receipt0.price}`
    );
    const totalReserveIn1 = expectedCost0;
    const desiredUnits1 = totalTokenSupply.div(10);
    const expectedPrice1 = basePrice.add(totalReserveIn1.div(reserveDivisor));
    const expectedCost1 = expectedPrice1.mul(desiredUnits1).div(ONE);
    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, expectedCost1.add(fee));
    await reserve
      .connect(signer1)
      .approve(sale.address, expectedCost1.add(fee));
    // buy another 10% of total supply
    const txBuy1 = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnits1,
      desiredUnits: desiredUnits1,
      maximumPrice: expectedPrice1,
    });
    const { receipt: receipt1 } = (await getEventArgs(
      txBuy1,
      "Buy",
      sale
    )) as BuyEvent["args"];
    assert(
      receipt1.price.eq(expectedPrice1),
      `wrong dynamic price1
      expected  ${expectedPrice1}
      got       ${receipt1.price}`
    );
  });

  it("should dynamically calculate price (based on remaining supply)", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const feeRecipient = signers[2];
    const signer1 = signers[3];
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
    const basePrice = ethers.BigNumber.from("75").mul(RESERVE_ONE);
    const supplyDivisor = ethers.BigNumber.from("1" + sixteenZeros);
    const constants = [
      basePrice,
      supplyDivisor,
      startBlock - 1,
      startBlock + saleDuration - 1,
    ];
    const vBasePrice = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vSupplyDivisor = op(
      Opcode.STATE,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vStart = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const vEnd = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([
        // maxUnits
        op(Opcode.CONTEXT, 0x0000),
        // price
        // ((REMAINING_UNITS 10000000000000000 /) 75 +)
        op(Opcode.STORAGE, SaleStorage.RemainingUnits),
        vSupplyDivisor,
        op(Opcode.DIV, 2),
        vBasePrice,
        op(Opcode.ADD, 2),
      ]),
    ];
    const [sale] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
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
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );
    const fee = ethers.BigNumber.from("1").mul(RESERVE_ONE);
    // wait until sale start
    await createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );
    await sale.start();
    const remainingSupplySummand = totalTokenSupply.div(supplyDivisor);
    const desiredUnits = totalTokenSupply.div(10);
    const expectedPrice = basePrice.add(remainingSupplySummand);
    const expectedCost = expectedPrice.mul(desiredUnits).div(ONE);
    const [, actualPrice] = await sale.calculateBuy(desiredUnits);
    assert(actualPrice.eq(expectedPrice), "wrong calculated price");
    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, expectedCost.add(fee));
    await reserve.connect(signer1).approve(sale.address, expectedCost.add(fee));
    // buy 1 unit
    const txBuy = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnits,
      desiredUnits,
      maximumPrice: expectedPrice,
    });
    const { receipt } = (await getEventArgs(
      txBuy,
      "Buy",
      sale
    )) as BuyEvent["args"];
    assert(
      receipt.price.eq(expectedPrice),
      `wrong dynamic price
      expected  ${expectedPrice}
      got       ${receipt.price}`
    );
  });

  it("should dynamically calculate price (based on the current block number)", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const feeRecipient = signers[2];
    const signer1 = signers[3];
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
    const basePrice = ethers.BigNumber.from("75").mul(RESERVE_ONE);
    const constants = [
      basePrice,
      startBlock - 1,
      startBlock + saleDuration - 1,
    ];
    const vBasePrice = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vStart = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const vEnd = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([
        // maxUnits
        op(Opcode.CONTEXT, 0x0000),
        // price
        // (BLOCK_NUMBER 75 +)
        op(Opcode.BLOCK_NUMBER),
        vBasePrice,
        op(Opcode.ADD, 2),
      ]),
    ];
    const [sale] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        interpreter: interpreter.address,
        expressionDeployer: expressionDeployer.address,
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
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );
    const fee = ethers.BigNumber.from("1").mul(RESERVE_ONE);
    // wait until sale start
    await createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );
    await sale.start();
    const desiredUnits0 = totalTokenSupply.div(10);
    const expectedPrice0 = basePrice.add(
      (await ethers.provider.getBlockNumber()) + 3
    ); // 2 blocks from now
    const expectedCost0 = expectedPrice0.mul(desiredUnits0).div(ONE);
    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, expectedCost0.add(fee));
    await reserve
      .connect(signer1)
      .approve(sale.address, expectedCost0.add(fee));
    // buy 1 unit
    const txBuy0 = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnits0,
      desiredUnits: desiredUnits0,
      maximumPrice: expectedPrice0,
    });
    const { receipt: receipt0 } = (await getEventArgs(
      txBuy0,
      "Buy",
      sale
    )) as BuyEvent["args"];
    assert(
      receipt0.price.eq(expectedPrice0),
      `wrong dynamic price
      expected  ${expectedPrice0}
      got       ${receipt0.price}`
    );
    const desiredUnits1 = totalTokenSupply.div(10);
    const expectedPrice1 = basePrice.add(
      (await ethers.provider.getBlockNumber()) + 3
    ); // 2 blocks from now
    const expectedCost1 = expectedPrice1.mul(desiredUnits1).div(ONE);
    await reserve.transfer(signer1.address, expectedCost1.add(fee));
    await reserve
      .connect(signer1)
      .approve(sale.address, expectedCost1.add(fee));
    // buy 1 unit
    const txBuy1 = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnits1,
      desiredUnits: desiredUnits1,
      maximumPrice: expectedPrice1,
    });
    const { receipt: receipt1 } = (await getEventArgs(
      txBuy1,
      "Buy",
      sale
    )) as BuyEvent["args"];
    assert(
      receipt1.price.eq(expectedPrice1),
      `wrong subsequent dynamic price
      expected  ${expectedPrice1}
      got       ${receipt1.price}`
    );
  });
});
