import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { CloneFactory, ReadWriteTier, ReserveToken } from "../../typechain";
import { BuyEvent, Sale } from "../../typechain/contracts/sale/Sale";
import { readWriteTierDeploy } from "../../utils";
import { zeroAddress } from "../../utils/constants/address";
import {
  fourZeros,
  ONE,
  RESERVE_ONE,
  sixteenZeros,
} from "../../utils/constants/bigNumber";
import { flowCloneFactory } from "../../utils/deploy/factory/cloneFactory";
import deploy1820 from "../../utils/deploy/registry1820/deploy";
import { saleClone, saleImplementation } from "../../utils/deploy/sale/deploy";
import { reserveDeploy } from "../../utils/deploy/test/reserve/deploy";
import { getEventArgs } from "../../utils/events";
import { createEmptyBlock } from "../../utils/hardhat";
import {
  generateEvaluableConfig,
  memoryOperand,
  MemoryType,
  op,
} from "../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../utils/interpreter/ops/allStandardOps";
import { betweenBlockNumbersSource } from "../../utils/interpreter/sale";
import { assertError } from "../../utils/test/assertError";
import { Tier } from "../../utils/types/tier";

const Opcode = AllStandardOps;

describe("Sale calculate price", async function () {
  let reserve: ReserveToken;
  let readWriteTier: ReadWriteTier;

  let cloneFactory: CloneFactory;
  let implementation: Sale;
  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    readWriteTier = await readWriteTierDeploy();

    //Deploy Clone Factory
    cloneFactory = await flowCloneFactory();

    implementation = await saleImplementation(cloneFactory);
  });

  beforeEach(async () => {
    reserve = await reserveDeploy();
  });

  it("should dynamically calculate price (discount off base price based on proportion of ERC20 token currently held by buyer)", async function () {
    const signers = await ethers.getSigners();
    const [deployer, recipient, signer1, feeRecipient] = signers;
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
    const vBasePrice = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vFractionMultiplier = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vStart = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 2)
    );
    const vEnd = op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3));
    // prettier-ignore
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([
        // maxUnits
        op(Opcode.context, 0x0300),
        // price
          vBasePrice,
              vFractionMultiplier,
                  op(Opcode.context, 0x0001), // sale address
                op(Opcode.isale_v2_token),
                op(Opcode.context, 0x0000), // sender
              op(Opcode.erc_20_balance_of),
            op(Opcode.mul, 2),
                  op(Opcode.context, 0x0001), // sale address
              op(Opcode.isale_v2_token),
            op(Opcode.erc_20_total_supply),
          op(Opcode.div, 2),
        op(Opcode.sub, 2),
      ]),
      concat([]),
    ];
    const evaluableConfig = await generateEvaluableConfig(sources, constants);
    const [sale, token] = await saleClone(
      signers,
      deployer,
      cloneFactory,
      implementation,
      {
        evaluableConfig: evaluableConfig,
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
    console.log("Here---");
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
    const [deployer, recipient, signer1, feeRecipient] = signers;
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
    const vBasePrice = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vFractionMultiplier = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vStart = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 2)
    );
    const vEnd = op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3));
    // prettier-ignore
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([
        // maxUnits
        op(Opcode.context, 0x0300),
        // price
          vBasePrice,
              vFractionMultiplier,
                  op(Opcode.context, 0x0001), // sale address
                op(Opcode.isale_v2_reserve),
                op(Opcode.context, 0x0000), // sender
              op(Opcode.erc_20_balance_of),
            op(Opcode.mul, 2),
                  op(Opcode.context, 0x0001), // sale address
              op(Opcode.isale_v2_reserve),
            op(Opcode.erc_20_total_supply),
          op(Opcode.div, 2),
        op(Opcode.sub, 2),
      ]),
      concat([]),
    ];
    const evaluableConfig = await generateEvaluableConfig(sources, constants);
    const [sale] = await saleClone(
      signers,
      deployer,
      cloneFactory,
      implementation,
      {
        evaluableConfig: evaluableConfig,
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
    const [deployer, recipient] = signers;
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
    const vStart = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vEnd = op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1));
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([op(99)]),
      concat([]),
    ]; // bad source
    const evaluableConfig = await generateEvaluableConfig(sources, constants);
    await assertError(
      async () =>
        await saleClone(
          signers,
          deployer,
          cloneFactory,
          implementation,
          {
            evaluableConfig: evaluableConfig,
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
    const [deployer, recipient, signer1, feeRecipient] = signers;
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
    const vBasePrice = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vSupplyDivisor = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vStart = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 2)
    );
    const vEnd = op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3));
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([
        // maxUnits
        op(Opcode.context, 0x0300),
        // price
        // ((CURRENT_BUY_UNITS priceDivisor /) 75 +)
        op(Opcode.context, 0x0300),
        vSupplyDivisor,
        op(Opcode.div, 2),
        vBasePrice,
        op(Opcode.add, 2),
      ]),
      concat([]),
    ];
    const evaluableConfig = await generateEvaluableConfig(sources, constants);
    const [sale] = await saleClone(
      signers,
      deployer,
      cloneFactory,
      implementation,
      {
        evaluableConfig: evaluableConfig,
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
    const [deployer, recipient, signer1, feeRecipient] = signers;
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
    const vBasePrice = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vReserveDivisor = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vStart = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 2)
    );
    const vEnd = op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3));
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([
        // targetUnits
        op(Opcode.context, 0x0300),
        // price
        // ((TOTAL_RESERVE_IN reserveDivisor /) 75 +)
        // sale contract
        op(Opcode.context, 0x0001),
        op(Opcode.isale_v2_total_reserve_received),
        vReserveDivisor,
        op(Opcode.div, 2),
        vBasePrice,
        op(Opcode.add, 2),
      ]),
      concat([]),
    ];
    const evaluableConfig = await generateEvaluableConfig(sources, constants);
    const [sale] = await saleClone(
      signers,
      deployer,
      cloneFactory,
      implementation,
      {
        evaluableConfig: evaluableConfig,
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
    const txBuy0 = await sale.connect(signer1).buy(
      {
        feeRecipient: feeRecipient.address,
        fee,
        minimumUnits: desiredUnits0,
        desiredUnits: desiredUnits0,
        maximumPrice: expectedPrice0,
      },
      { gasLimit: 1000000 }
    );
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
    const [deployer, recipient, signer1, feeRecipient] = signers;
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
    const vBasePrice = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vSupplyDivisor = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vStart = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 2)
    );
    const vEnd = op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3));
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([
        // maxUnits
        op(Opcode.context, 0x0300),
        // price
        // ((REMAINING_UNITS 10000000000000000 /) 75 +)
        op(Opcode.context, 0x0001), // sale address
        op(Opcode.isale_v2_remaining_token_inventory),
        vSupplyDivisor,
        op(Opcode.div, 2),
        vBasePrice,
        op(Opcode.add, 2),
      ]),
      concat([]),
    ];
    const evaluableConfig = await generateEvaluableConfig(sources, constants);
    const [sale] = await saleClone(
      signers,
      deployer,
      cloneFactory,
      implementation,
      {
        evaluableConfig: evaluableConfig,
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
    const [, actualPrice] = await sale.previewCalculateBuy(desiredUnits);
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
    const [deployer, recipient, signer1, feeRecipient] = signers;
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
    const vBasePrice = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vStart = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vEnd = op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2));
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([
        // maxUnits
        op(Opcode.context, 0x0001),
        // price
        // (BLOCK_NUMBER 75 +)
        op(Opcode.block_number),
        vBasePrice,
        op(Opcode.add, 2),
      ]),
      concat([]),
    ];
    const evaluableConfig = await generateEvaluableConfig(sources, constants);
    const [sale] = await saleClone(
      signers,
      deployer,
      cloneFactory,
      implementation,
      {
        evaluableConfig: evaluableConfig,
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
