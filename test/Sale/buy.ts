import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { ReadWriteTier } from "../../typechain";
import { ReserveToken } from "../../typechain";
import { SaleFactory } from "../../typechain";
import { SaleReentrant } from "../../typechain";
import { BuyEvent } from "../../typechain/contracts/sale/Sale";
import { zeroAddress } from "../../utils/constants/address";
import { fourZeros, ONE, RESERVE_ONE } from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basic";
import { saleDependenciesDeploy, saleDeploy } from "../../utils/deploy/sale";
import { getEventArgs } from "../../utils/events";
import { createEmptyBlock } from "../../utils/hardhat";
import { AllStandardOps } from "../../utils/interpreter/ops/allStandardOps";
import { betweenBlockNumbersSource } from "../../utils/interpreter/sale";
import {
  op,
  memoryOperand,
  MemoryType,
} from "../../utils/interpreter/interpreter";
import { assertError } from "../../utils/test/assertError";
import { SaleStorage, Status } from "../../utils/types/sale";
import { Tier } from "../../utils/types/tier";

const Opcode = AllStandardOps;

describe("Sale buy", async function () {
  let reserve: ReserveToken,
    readWriteTier: ReadWriteTier,
    saleFactory: SaleFactory;

  before(async () => {
    ({ readWriteTier, saleFactory } = await saleDependenciesDeploy());
  });

  beforeEach(async () => {
    reserve = (await basicDeploy("ReserveToken", {})) as ReserveToken;
    await reserve.initialize();
  });

  it("should correctly generate receipts", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const feeRecipient = signers[2];
    const signer1 = signers[3];
    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleDuration = 30;
    const minimumRaise = ethers.BigNumber.from("150000").mul(RESERVE_ONE);
    const totalTokenSupply = ethers.BigNumber.from("2000").mul(ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: zeroAddress,
      initialSupply: totalTokenSupply,
    };
    const staticPrice = ethers.BigNumber.from("75").mul(RESERVE_ONE);
    const constants = [
      staticPrice,
      startBlock - 1,
      startBlock + saleDuration - 1,
    ];
    const vBasePrice = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vStart = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const vEnd = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([op(Opcode.CONTEXT, 0x0000), vBasePrice]),
    ];
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
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );
    const fee = ethers.BigNumber.from("1").mul(RESERVE_ONE);
    const desiredUnits = totalTokenSupply;
    const cost = staticPrice.mul(desiredUnits).div(ONE);
    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, cost.add(fee));
    const signer1ReserveBalance = await reserve.balanceOf(signer1.address);
    // wait until sale start
    await createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );
    await sale.start();
    await reserve.connect(signer1).approve(sale.address, signer1ReserveBalance);
    // buy some units
    const txBuy0 = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnits.div(10),
      desiredUnits: desiredUnits.div(10),
      maximumPrice: staticPrice,
    });
    const { receipt: receipt0 } = (await getEventArgs(
      txBuy0,
      "Buy",
      sale
    )) as BuyEvent["args"];
    assert(receipt0.id.eq(0), "wrong receipt0 id");
    assert(
      receipt0.feeRecipient === feeRecipient.address,
      "wrong receipt0 feeRecipient"
    );
    assert(receipt0.fee.eq(fee), "wrong receipt0 fee");
    assert(receipt0.units.eq(desiredUnits.div(10)), "wrong receipt0 units");
    assert(receipt0.price.eq(staticPrice), "wrong receipt0 price");
    // buy some units
    const txBuy1 = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnits.div(10),
      desiredUnits: desiredUnits.div(10),
      maximumPrice: staticPrice,
    });
    const { receipt: receipt1 } = (await getEventArgs(
      txBuy1,
      "Buy",
      sale
    )) as BuyEvent["args"];
    assert(receipt1.id.eq(1), "wrong receipt1 id");
    assert(
      receipt1.feeRecipient === feeRecipient.address,
      "wrong receipt1 feeRecipient"
    );
    assert(receipt1.fee.eq(fee), "wrong receipt1 fee");
    assert(receipt1.units.eq(desiredUnits.div(10)), "wrong receipt1 units");
    assert(receipt1.price.eq(staticPrice), "wrong receipt1 price");
    // buy some units
    const txBuy2 = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnits.div(10),
      desiredUnits: desiredUnits.div(10),
      maximumPrice: staticPrice,
    });
    const { receipt: receipt2 } = (await getEventArgs(
      txBuy2,
      "Buy",
      sale
    )) as BuyEvent["args"];
    assert(receipt2.id.eq(2), "wrong receipt2 id");
    assert(
      receipt2.feeRecipient === feeRecipient.address,
      "wrong receipt2 feeRecipient"
    );
    assert(receipt2.fee.eq(fee), "wrong receipt2 fee");
    assert(receipt2.units.eq(desiredUnits.div(10)), "wrong receipt2 units");
    assert(receipt2.price.eq(staticPrice), "wrong receipt2 price");
  });

  it("should use calculated maxUnits when processing buy if maxUnits is less than targetUnits", async () => {
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
    const maxUnits = ethers.BigNumber.from(3);
    const constants = [
      basePrice,
      startBlock - 1,
      startBlock + saleDuration - 1,
      maxUnits,
    ];
    const vBasePrice = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vStart = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const vEnd = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const vMaxUnits = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      // prettier-ignore
      concat([
        // maxUnits
        vMaxUnits, // static amount
        // price
        vBasePrice,
      ]),
    ];

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
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(RESERVE_ONE);

    // wait until sale start
    await createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    const desiredUnits0 = totalTokenSupply.div(10);

    const expectedPrice0 = basePrice;
    const expectedCost0 = expectedPrice0.mul(maxUnits).div(ONE);

    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, expectedCost0.add(fee));
    await reserve
      .connect(signer1)
      .approve(sale.address, expectedCost0.add(fee));

    const txBuy0 = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: 1,
      desiredUnits: desiredUnits0,
      maximumPrice: expectedPrice0,
    });
    const { receipt: receipt0 } = (await getEventArgs(
      txBuy0,
      "Buy",
      sale
    )) as BuyEvent["args"];
    assert(receipt0.id.eq(0), "wrong receipt0 id");
    assert(
      receipt0.feeRecipient === feeRecipient.address,
      "wrong receipt0 feeRecipient"
    );
    assert(receipt0.fee.eq(fee), "wrong receipt0 fee");
    assert(receipt0.units.eq(maxUnits), "wrong receipt0 units");
    assert(receipt0.price.eq(expectedPrice0), "wrong receipt0 price");
  });

  it("should prevent reentrant buys", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const feeRecipient = signers[2];
    const signer1 = signers[3];
    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleDuration = 30;
    const minimumRaise = ethers.BigNumber.from("150000").mul(RESERVE_ONE);
    const totalTokenSupply = ethers.BigNumber.from("2000").mul(ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: zeroAddress,
      initialSupply: totalTokenSupply,
    };
    const staticPrice = ethers.BigNumber.from("75").mul(RESERVE_ONE);
    const constants = [
      staticPrice,
      startBlock - 1,
      startBlock + saleDuration - 1,
    ];
    const vBasePrice = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vStart = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const vEnd = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([op(Opcode.CONTEXT, 0x0000), vBasePrice]),
    ];
    const cooldownDuration = 5;
    const maliciousReserveFactory = await ethers.getContractFactory(
      "SaleReentrant"
    );
    const maliciousReserve =
      (await maliciousReserveFactory.deploy()) as SaleReentrant;
    await maliciousReserve.initialize();
    // If cooldown could be set to zero, reentrant buy calls would be possible.
    await assertError(
      async () =>
        await saleDeploy(
          signers,
          deployer,
          saleFactory,
          {
            interpreterStateConfig: {
              sources,
              constants,
            },
            recipient: recipient.address,
            reserve: maliciousReserve.address,
            cooldownDuration: 0, // zero
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
        ),
      "COOLDOWN_0",
      "did not prevent configuring a cooldown of 0 blocks"
    );
    const [sale, token] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        interpreterStateConfig: {
          sources,
          constants,
        },
        recipient: recipient.address,
        reserve: maliciousReserve.address,
        cooldownDuration,
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
    const desiredUnits = totalTokenSupply;
    const cost = staticPrice.mul(desiredUnits).div(ONE);
    // give signer1 reserve to cover cost + fee
    await maliciousReserve.transfer(signer1.address, cost.add(fee));
    const signer1ReserveBalance = await maliciousReserve.balanceOf(
      signer1.address
    );
    // wait until sale start
    await createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );
    const saleStatusPending = await sale.saleStatus();
    assert(
      saleStatusPending === Status.PENDING,
      `wrong status
      expected  ${Status.PENDING}
      got       ${saleStatusPending}`
    );
    await sale.start();
    const saleStatusActive = await sale.saleStatus();
    assert(
      saleStatusActive === Status.ACTIVE,
      `wrong status
      expected  ${Status.ACTIVE}
      got       ${saleStatusActive}`
    );
    await maliciousReserve
      .connect(signer1)
      .approve(sale.address, signer1ReserveBalance);
    await token.connect(signer1).approve(sale.address, signer1ReserveBalance);
    const buyConfig = {
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: 10,
      desiredUnits: 10,
      maximumPrice: staticPrice,
    };
    await maliciousReserve.addReentrantTarget(sale.address, buyConfig);
    // buy some units
    await assertError(
      async () => await sale.connect(signer1).buy(buyConfig),
      "COOLDOWN",
      "Cooldown (with non-zero configured cooldown duration) did not revert reentrant buy call"
    );
  });

  it("should respect buy cooldown when sale is active", async function () {
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
    const staticPrice = ethers.BigNumber.from("75").mul(RESERVE_ONE);
    const constants = [
      staticPrice,
      startBlock - 1,
      startBlock + saleDuration - 1,
    ];
    const vBasePrice = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vStart = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const vEnd = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([op(Opcode.CONTEXT, 0x0000), vBasePrice]),
    ];
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
        cooldownDuration: 5,
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
    const desiredUnits = totalTokenSupply;
    const cost = staticPrice.mul(desiredUnits).div(ONE);
    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, cost.add(fee));
    const signer1ReserveBalance = await reserve.balanceOf(signer1.address);
    // wait until sale start
    await createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );
    const saleStatusPending = await sale.saleStatus();
    assert(
      saleStatusPending === Status.PENDING,
      `wrong status
      expected  ${Status.PENDING}
      got       ${saleStatusPending}`
    );
    await sale.start();
    const saleStatusActive = await sale.saleStatus();
    assert(
      saleStatusActive === Status.ACTIVE,
      `wrong status
      expected  ${Status.ACTIVE}
      got       ${saleStatusActive}`
    );
    await reserve.connect(signer1).approve(sale.address, signer1ReserveBalance);
    // buy some units
    await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: 10,
      desiredUnits: 10,
      maximumPrice: staticPrice,
    });
    // immediately buy some more units before cooldown end
    await assertError(
      async () =>
        await sale.connect(signer1).buy({
          feeRecipient: feeRecipient.address,
          fee,
          minimumUnits: 10,
          desiredUnits: 10,
          maximumPrice: staticPrice,
        }),
      "COOLDOWN",
      "successive buy did not trigger cooldown while Sale was Active"
    );
  });

  it("should prevent a buy which leaves remaining units less than configured `dustSize`", async function () {
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
    const dustSize = totalTokenSupply.div(10 ** 7); // arbitrary value
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: zeroAddress,
      initialSupply: totalTokenSupply,
    };
    const staticPrice = ethers.BigNumber.from("75").mul(RESERVE_ONE);
    const constants = [
      staticPrice,
      startBlock - 1,
      startBlock + saleDuration - 1,
    ];
    const vBasePrice = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vStart = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const vEnd = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([op(Opcode.CONTEXT, 0x0000), vBasePrice]),
    ];
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
        dustSize,
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
    const desiredUnits = totalTokenSupply.add(1).sub(dustSize);
    const expectedPrice = staticPrice;
    const expectedCost = expectedPrice.mul(desiredUnits).div(ONE);
    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, expectedCost.add(fee));
    await reserve.connect(signer1).approve(sale.address, expectedCost.add(fee));
    // attempt to leave remaining units
    await assertError(
      async () =>
        await sale.connect(signer1).buy({
          feeRecipient: feeRecipient.address,
          fee,
          minimumUnits: 1, // user configures ANY minimum > 0
          desiredUnits: desiredUnits,
          maximumPrice: expectedPrice,
        }),
      "DUST",
      "wrongly purchased number of units which leaves less than `dustSize` units remaining"
    );
  });

  it("should support multiple successive buys", async function () {
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

    const [actualMaxUnits0_, actualPrice0_] = await sale.calculateBuy(
      desiredUnits0
    );

    assert(
      expectedPrice0.eq(actualPrice0_),
      `wrong price returned from Sale._calculateBuy()
      expected  ${expectedPrice0}
      got       ${actualPrice0_}
      -
      maxUnits      ${actualMaxUnits0_}
      desiredUnits  ${desiredUnits0}`
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
    const totalReserveIn2 = expectedCost1.add(expectedCost0);
    const desiredUnits2 = totalTokenSupply.div(10);
    const expectedPrice2 = basePrice.add(totalReserveIn2.div(reserveDivisor));
    const expectedCost2 = expectedPrice2.mul(desiredUnits2).div(ONE);
    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, expectedCost2.add(fee));
    await reserve
      .connect(signer1)
      .approve(sale.address, expectedCost2.add(fee));
    // buy another 10% of total supply
    const txBuy2 = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnits2,
      desiredUnits: desiredUnits2,
      maximumPrice: expectedPrice2,
    });
    const { receipt: receipt2 } = (await getEventArgs(
      txBuy2,
      "Buy",
      sale
    )) as BuyEvent["args"];
    assert(
      receipt2.price.eq(expectedPrice2),
      `wrong dynamic price2
      expected  ${expectedPrice2}
      got       ${receipt2.price}`
    );
    const totalReserveIn3 = expectedCost2.add(expectedCost1).add(expectedCost0);
    const desiredUnits3 = totalTokenSupply.div(10);
    const expectedPrice3 = basePrice.add(totalReserveIn3.div(reserveDivisor));
    const expectedCost3 = expectedPrice3.mul(desiredUnits3).div(ONE);
    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, expectedCost3.add(fee));
    await reserve
      .connect(signer1)
      .approve(sale.address, expectedCost3.add(fee));
    // buy another 10% of total supply
    const txBuy3 = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnits3,
      desiredUnits: desiredUnits3,
      maximumPrice: expectedPrice3,
    });
    const { receipt: receipt3 } = (await getEventArgs(
      txBuy3,
      "Buy",
      sale
    )) as BuyEvent["args"];
    assert(
      receipt3.price.eq(expectedPrice3),
      `wrong dynamic price3
      expected  ${expectedPrice3}
      got       ${receipt3.price}`
    );
    const totalReserveIn4 = expectedCost3
      .add(expectedCost2)
      .add(expectedCost1)
      .add(expectedCost0);
    const desiredUnits4 = totalTokenSupply.div(10);
    const expectedPrice4 = basePrice.add(totalReserveIn4.div(reserveDivisor));
    const expectedCost4 = expectedPrice4.mul(desiredUnits4).div(ONE);
    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, expectedCost4.add(fee));
    await reserve
      .connect(signer1)
      .approve(sale.address, expectedCost4.add(fee));
    // buy another 10% of total supply
    const txBuy4 = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnits4,
      desiredUnits: desiredUnits4,
      maximumPrice: expectedPrice4,
    });
    const { receipt: receipt4 } = (await getEventArgs(
      txBuy4,
      "Buy",
      sale
    )) as BuyEvent["args"];
    assert(
      receipt4.price.eq(expectedPrice4),
      `wrong dynamic price4
      expected  ${expectedPrice4}
      got       ${receipt4.price}`
    );
    const totalReserveIn5 = expectedCost4
      .add(expectedCost3)
      .add(expectedCost2)
      .add(expectedCost1)
      .add(expectedCost0);
    const desiredUnits5 = totalTokenSupply.div(10);
    const expectedPrice5 = basePrice.add(totalReserveIn5.div(reserveDivisor));
    const expectedCost5 = expectedPrice5.mul(desiredUnits5).div(ONE);
    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, expectedCost5.add(fee));
    await reserve
      .connect(signer1)
      .approve(sale.address, expectedCost5.add(fee));
    // buy another 10% of total supply
    const txBuy5 = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnits5,
      desiredUnits: desiredUnits5,
      maximumPrice: expectedPrice5,
    });
    const { receipt: receipt5 } = (await getEventArgs(
      txBuy5,
      "Buy",
      sale
    )) as BuyEvent["args"];
    assert(
      receipt5.price.eq(expectedPrice5),
      `wrong dynamic price5
      expected  ${expectedPrice5}
      got       ${receipt5.price}`
    );
  });
});
