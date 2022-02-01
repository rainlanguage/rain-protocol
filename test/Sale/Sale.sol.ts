import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { artifacts, ethers } from "hardhat";
import type { Contract, ContractFactory } from "ethers";
import type {
  SaleConfigStruct,
  SaleConstructorConfigStruct,
  SaleFactory,
  SaleRedeemableERC20ConfigStruct,
} from "../../typechain/SaleFactory";
import type { BuyEvent, Sale } from "../../typechain/Sale";
import { getEventArgs, op } from "../Util";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ReserveToken } from "../../typechain/ReserveToken";
import { ReadWriteTier } from "../../typechain/ReadWriteTier";
import { RedeemableERC20Factory } from "../../typechain/RedeemableERC20Factory";
import { concat } from "ethers/lib/utils";
import type { RedeemableERC20 } from "../../typechain/RedeemableERC20";

chai.use(solidity);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { expect, assert } = chai;

enum Tier {
  ZERO,
  ONE,
  TWO,
  THREE,
  FOUR,
  FIVE,
  SIX,
  SEVEN,
  EIGHT,
}

enum Status {
  PENDING,
  SUCCESS,
  FAIL,
}

const enum Opcode {
  SKIP,
  VAL,
  DUP,
  ZIPMAP,
  BLOCK_NUMBER,
  SENDER,
  ADD,
  SUB,
  MUL,
  DIV,
  MOD,
  POW,
  MIN,
  MAX,
  REPORT,
  NEVER,
  ALWAYS,
  SATURATING_DIFF,
  UPDATE_BLOCKS_FOR_TIER_RANGE,
  SELECT_LTE,
  REMAINING_UNITS,
  TOTAL_RESERVE_IN,
  LAST_RESERVE_IN,
  LAST_BUY_BLOCK,
  LAST_BUY_UNITS,
  LAST_BUY_PRICE,
  CURRENT_BUY_UNITS,
}

const saleDeploy = async (
  signers: SignerWithAddress[],
  deployer: SignerWithAddress,
  saleFactory: SaleFactory & Contract,
  config: SaleConfigStruct,
  saleRedeemableERC20Config: SaleRedeemableERC20ConfigStruct,
  ...args
): Promise<[Sale & Contract, RedeemableERC20 & Contract]> => {
  const txDeploy = await saleFactory.createChildTyped(
    config,
    saleRedeemableERC20Config,
    ...args
  );

  const sale = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(txDeploy, "NewChild", saleFactory)).child
      ),
      20 // address bytes length
    ),
    (await artifacts.readArtifact("Sale")).abi,
    deployer
  ) as Sale & Contract;

  if (!ethers.utils.isAddress(sale.address)) {
    throw new Error(
      `invalid sale address: ${sale.address} (${sale.address.length} chars)`
    );
  }

  await sale.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  sale.deployTransaction = txDeploy;

  let token = new ethers.Contract(
    await sale.token(),
    (await artifacts.readArtifact("RedeemableERC20")).abi
  ) as RedeemableERC20 & Contract;

  token = token.connect(signers[0]); // need to do this for some reason

  return [sale, token];
};

let reserve: ReserveToken & Contract,
  redeemableERC20FactoryFactory: ContractFactory,
  redeemableERC20Factory: RedeemableERC20Factory & Contract,
  readWriteTierFactory: ContractFactory,
  readWriteTier: ReadWriteTier & Contract,
  saleConstructorConfig: SaleConstructorConfigStruct,
  saleFactoryFactory: ContractFactory,
  saleFactory: SaleFactory & Contract;

describe("Sale", async function () {
  beforeEach(async () => {
    reserve = (await Util.basicDeploy("ReserveToken", {})) as ReserveToken &
      Contract;
  });

  before(async () => {
    redeemableERC20FactoryFactory = await ethers.getContractFactory(
      "RedeemableERC20Factory",
      {}
    );
    redeemableERC20Factory =
      (await redeemableERC20FactoryFactory.deploy()) as RedeemableERC20Factory &
        Contract;
    await redeemableERC20Factory.deployed();

    readWriteTierFactory = await ethers.getContractFactory("ReadWriteTier");
    readWriteTier = (await readWriteTierFactory.deploy()) as ReadWriteTier &
      Contract;
    await readWriteTier.deployed();

    saleConstructorConfig = {
      redeemableERC20Factory: redeemableERC20Factory.address,
    };

    saleFactoryFactory = await ethers.getContractFactory("SaleFactory", {});
    saleFactory = (await saleFactoryFactory.deploy(
      saleConstructorConfig
    )) as SaleFactory & Contract;
    await saleFactory.deployed();
  });

  it("should prevent a buy which leaves remaining units less than configured `dustSize`", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const feeRecipient = signers[2];
    const signer1 = signers[3];

    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleTimeout = 30;
    const minimumRaise = ethers.BigNumber.from("100000").mul(Util.RESERVE_ONE);

    const totalTokenSupply = ethers.BigNumber.from("2000").mul(Util.ONE);
    const dustSize = totalTokenSupply.div(10 ** 7); // arbitrary value
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };

    const staticPrice = ethers.BigNumber.from("75").mul(Util.RESERVE_ONE);

    const constants = [staticPrice];
    const vStaticPrice = op(Opcode.VAL, 0);

    const sources = [concat([vStaticPrice])];

    const [sale] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        vmStateConfig: {
          sources,
          constants,
          stackLength: 3,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        startBlock,
        cooldownDuration: 1,
        saleTimeout,
        minimumRaise,
        dustSize,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    const desiredUnits = totalTokenSupply.add(1).sub(dustSize);
    const expectedPrice = staticPrice;
    const expectedCost = expectedPrice.mul(desiredUnits).div(Util.ONE);

    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, expectedCost.add(fee));

    await reserve.connect(signer1).approve(sale.address, expectedCost.add(fee));

    // attempt to leave remaining units
    await Util.assertError(
      async () =>
        await sale.connect(signer1).buy({
          feeRecipient: feeRecipient.address,
          fee,
          minimumUnits: 0, // user configures ANY minimum
          desiredUnits: desiredUnits,
          maximumPrice: expectedPrice,
        }),
      "DUST",
      "wrongly purchased number of units which leaves less than `dustSize` units remaining"
    );
  });

  it("should dynamically calculate price (based on number of units being bought)", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const feeRecipient = signers[2];
    const signer1 = signers[3];

    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleTimeout = 30;
    const minimumRaise = ethers.BigNumber.from("100000").mul(Util.RESERVE_ONE);

    const totalTokenSupply = ethers.BigNumber.from("2000").mul(Util.ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };

    const basePrice = ethers.BigNumber.from("75").mul(Util.RESERVE_ONE);

    const supplyDivisor = ethers.BigNumber.from("1" + Util.sixteenZeros);

    const constants = [basePrice, supplyDivisor];
    const vBasePrice = op(Opcode.VAL, 0);
    const vSupplyDivisor = op(Opcode.VAL, 1);

    const sources = [
      concat([
        // ((CURRENT_BUY_UNITS priceDivisor /) 75 +)
        op(Opcode.CURRENT_BUY_UNITS),
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
        vmStateConfig: {
          sources,
          constants,
          stackLength: 3,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        startBlock,
        cooldownDuration: 1,
        saleTimeout,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    const desiredUnits0 = totalTokenSupply.div(10);
    const expectedPrice0 = basePrice.add(desiredUnits0.div(supplyDivisor));
    const expectedCost0 = expectedPrice0.mul(desiredUnits0).div(Util.ONE);

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

    const { receipt: receipt0 } = (await Util.getEventArgs(
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
    const expectedCost1 = expectedPrice1.mul(desiredUnits1).div(Util.ONE);

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

    const { receipt: receipt1 } = (await Util.getEventArgs(
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

  it("should dynamically calculate price (based on unit price in most recent buy)", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const feeRecipient = signers[2];
    const signer1 = signers[3];

    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleTimeout = 30;
    const minimumRaise = ethers.BigNumber.from("100000").mul(Util.RESERVE_ONE);

    const totalTokenSupply = ethers.BigNumber.from("2000").mul(Util.ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };

    const basePrice = ethers.BigNumber.from("75").mul(Util.RESERVE_ONE);

    const priceDivisor = ethers.BigNumber.from("1" + Util.fourZeros);

    const constants = [basePrice, priceDivisor];
    const vBasePrice = op(Opcode.VAL, 0);
    const vPriceDivisor = op(Opcode.VAL, 1);

    const sources = [
      concat([
        // ((LAST_BUY_PRICE priceDivisor /) 75 +)
        op(Opcode.LAST_BUY_PRICE),
        vPriceDivisor,
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
        vmStateConfig: {
          sources,
          constants,
          stackLength: 3,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        startBlock,
        cooldownDuration: 1,
        saleTimeout,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    const desiredUnits0 = totalTokenSupply.div(10);
    const expectedPrice0 = basePrice.add(0);
    const expectedCost0 = expectedPrice0.mul(desiredUnits0).div(Util.ONE);

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

    const { receipt: receipt0 } = (await Util.getEventArgs(
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
    const expectedPrice1 = basePrice.add(expectedPrice0.div(priceDivisor));
    const expectedCost1 = expectedPrice1.mul(desiredUnits1).div(Util.ONE);

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

    const { receipt: receipt1 } = (await Util.getEventArgs(
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

  it("should dynamically calculate price (based on number of units sold in most recent buy)", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const feeRecipient = signers[2];
    const signer1 = signers[3];

    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleTimeout = 30;
    const minimumRaise = ethers.BigNumber.from("100000").mul(Util.RESERVE_ONE);

    const totalTokenSupply = ethers.BigNumber.from("2000").mul(Util.ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };

    const basePrice = ethers.BigNumber.from("75").mul(Util.RESERVE_ONE);

    const supplyDivisor = ethers.BigNumber.from("1" + Util.sixteenZeros);

    const constants = [basePrice, supplyDivisor];
    const vBasePrice = op(Opcode.VAL, 0);
    const vSupplyDivisor = op(Opcode.VAL, 1);

    const sources = [
      concat([
        // ((LAST_BUY_UNITS supplyDivisor /) 75 +)
        op(Opcode.LAST_BUY_UNITS),
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
        vmStateConfig: {
          sources,
          constants,
          stackLength: 3,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        startBlock,
        cooldownDuration: 1,
        saleTimeout,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    const desiredUnits0 = totalTokenSupply.div(10);
    const expectedPrice0 = basePrice.add(0);
    const expectedCost0 = expectedPrice0.mul(desiredUnits0).div(Util.ONE);

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

    const { receipt: receipt0 } = (await Util.getEventArgs(
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
    const expectedPrice1 = basePrice.add(desiredUnits0.div(supplyDivisor));
    const expectedCost1 = expectedPrice1.mul(desiredUnits1).div(Util.ONE);

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

    const { receipt: receipt1 } = (await Util.getEventArgs(
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

  it("should dynamically calculate price (based on block of most recent buy)", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const feeRecipient = signers[2];
    const signer1 = signers[3];

    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleTimeout = 30;
    const minimumRaise = ethers.BigNumber.from("100000").mul(Util.RESERVE_ONE);

    const totalTokenSupply = ethers.BigNumber.from("2000").mul(Util.ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };

    const basePrice = ethers.BigNumber.from("75").mul(Util.RESERVE_ONE);

    const constants = [basePrice];
    const vBasePrice = op(Opcode.VAL, 0);

    const sources = [
      concat([
        // (LAST_BUY_BLOCK 75 +)
        op(Opcode.LAST_BUY_BLOCK),
        vBasePrice,
        op(Opcode.ADD, 2),
      ]),
    ];

    const [sale] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        vmStateConfig: {
          sources,
          constants,
          stackLength: 3,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        startBlock,
        cooldownDuration: 1,
        saleTimeout,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    const desiredUnits0 = totalTokenSupply.div(10);
    const expectedPrice0 = basePrice.add(0);
    const expectedCost0 = expectedPrice0.mul(desiredUnits0).div(Util.ONE);

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

    const blockLastBuy0 = await ethers.provider.getBlockNumber();

    const { receipt: receipt0 } = (await Util.getEventArgs(
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
    const expectedPrice1 = basePrice.add(blockLastBuy0);
    const expectedCost1 = expectedPrice1.mul(desiredUnits1).div(Util.ONE);

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

    const { receipt: receipt1 } = (await Util.getEventArgs(
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

  it("should dynamically calculate price (based on last reserve in)", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const feeRecipient = signers[2];
    const signer1 = signers[3];

    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleTimeout = 30;
    const minimumRaise = ethers.BigNumber.from("100000").mul(Util.RESERVE_ONE);

    const totalTokenSupply = ethers.BigNumber.from("2000").mul(Util.ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };

    const basePrice = ethers.BigNumber.from("75").mul(Util.RESERVE_ONE);

    const reserveDivisor = ethers.BigNumber.from("1" + Util.fourZeros);

    const constants = [basePrice, reserveDivisor];
    const vBasePrice = op(Opcode.VAL, 0);
    const vReserveDivisor = op(Opcode.VAL, 1);

    const sources = [
      concat([
        // ((LAST_RESERVE_IN reserveDivisor /) 75 +)
        op(Opcode.LAST_RESERVE_IN),
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
        vmStateConfig: {
          sources,
          constants,
          stackLength: 3,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        startBlock,
        cooldownDuration: 1,
        saleTimeout,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    const desiredUnits0 = totalTokenSupply.div(10);
    const expectedPrice0 = basePrice.add(0);
    const expectedCost0 = expectedPrice0.mul(desiredUnits0).div(Util.ONE);

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

    const { receipt: receipt0 } = (await Util.getEventArgs(
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

    const lastReserveIn1 = expectedCost0;

    const desiredUnits1 = totalTokenSupply.div(10);
    const expectedPrice1 = basePrice.add(lastReserveIn1.div(reserveDivisor));
    const expectedCost1 = expectedPrice1.mul(desiredUnits1).div(Util.ONE);

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

    const { receipt: receipt1 } = (await Util.getEventArgs(
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

  it("should support multiple successive buys (same logic as the following total reserve in test)", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const feeRecipient = signers[2];
    const signer1 = signers[3];

    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleTimeout = 30;
    const minimumRaise = ethers.BigNumber.from("100000").mul(Util.RESERVE_ONE);

    const totalTokenSupply = ethers.BigNumber.from("2000").mul(Util.ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };

    const basePrice = ethers.BigNumber.from("75").mul(Util.RESERVE_ONE);

    const reserveDivisor = ethers.BigNumber.from("1" + Util.fourZeros);

    const constants = [basePrice, reserveDivisor];
    const vBasePrice = op(Opcode.VAL, 0);
    const vReserveDivisor = op(Opcode.VAL, 1);

    const sources = [
      concat([
        // ((TOTAL_RESERVE_IN reserveDivisor /) 75 +)
        op(Opcode.TOTAL_RESERVE_IN),
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
        vmStateConfig: {
          sources,
          constants,
          stackLength: 3,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        startBlock,
        cooldownDuration: 1,
        saleTimeout,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    const desiredUnits0 = totalTokenSupply.div(10);
    const expectedPrice0 = basePrice.add(0);
    const expectedCost0 = expectedPrice0.mul(desiredUnits0).div(Util.ONE);

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

    const { receipt: receipt0 } = (await Util.getEventArgs(
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
    const expectedCost1 = expectedPrice1.mul(desiredUnits1).div(Util.ONE);

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

    const { receipt: receipt1 } = (await Util.getEventArgs(
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
    const expectedCost2 = expectedPrice2.mul(desiredUnits2).div(Util.ONE);

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

    const { receipt: receipt2 } = (await Util.getEventArgs(
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
    const expectedCost3 = expectedPrice3.mul(desiredUnits3).div(Util.ONE);

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

    const { receipt: receipt3 } = (await Util.getEventArgs(
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
    const expectedCost4 = expectedPrice4.mul(desiredUnits4).div(Util.ONE);

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

    const { receipt: receipt4 } = (await Util.getEventArgs(
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
    const expectedCost5 = expectedPrice5.mul(desiredUnits5).div(Util.ONE);

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

    const { receipt: receipt5 } = (await Util.getEventArgs(
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

  it("should dynamically calculate price (based on total reserve in)", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const feeRecipient = signers[2];
    const signer1 = signers[3];

    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleTimeout = 30;
    const minimumRaise = ethers.BigNumber.from("100000").mul(Util.RESERVE_ONE);

    const totalTokenSupply = ethers.BigNumber.from("2000").mul(Util.ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };

    const basePrice = ethers.BigNumber.from("75").mul(Util.RESERVE_ONE);

    const reserveDivisor = ethers.BigNumber.from("1" + Util.fourZeros);

    const constants = [basePrice, reserveDivisor];
    const vBasePrice = op(Opcode.VAL, 0);
    const vReserveDivisor = op(Opcode.VAL, 1);

    const sources = [
      concat([
        // ((TOTAL_RESERVE_IN reserveDivisor /) 75 +)
        op(Opcode.TOTAL_RESERVE_IN),
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
        vmStateConfig: {
          sources,
          constants,
          stackLength: 3,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        startBlock,
        cooldownDuration: 1,
        saleTimeout,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    const desiredUnits0 = totalTokenSupply.div(10);
    const expectedPrice0 = basePrice.add(0);
    const expectedCost0 = expectedPrice0.mul(desiredUnits0).div(Util.ONE);

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

    const { receipt: receipt0 } = (await Util.getEventArgs(
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
    const expectedCost1 = expectedPrice1.mul(desiredUnits1).div(Util.ONE);

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

    const { receipt: receipt1 } = (await Util.getEventArgs(
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
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const feeRecipient = signers[2];
    const signer1 = signers[3];

    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleTimeout = 30;
    const minimumRaise = ethers.BigNumber.from("100000").mul(Util.RESERVE_ONE);

    const totalTokenSupply = ethers.BigNumber.from("2000").mul(Util.ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };

    const basePrice = ethers.BigNumber.from("75").mul(Util.RESERVE_ONE);

    const supplyDivisor = ethers.BigNumber.from("1" + Util.sixteenZeros);

    const constants = [basePrice, supplyDivisor];
    const vBasePrice = op(Opcode.VAL, 0);
    const vSupplyDivisor = op(Opcode.VAL, 1);

    const sources = [
      concat([
        // ((REMAINING_UNITS 10000000000000000 /) 75 +)
        op(Opcode.REMAINING_UNITS),
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
        vmStateConfig: {
          sources,
          constants,
          stackLength: 3,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        startBlock,
        cooldownDuration: 1,
        saleTimeout,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    const remainingSupplySummand = totalTokenSupply.div(supplyDivisor);

    const desiredUnits = totalTokenSupply.div(10);
    const expectedPrice = basePrice.add(remainingSupplySummand);
    const expectedCost = expectedPrice.mul(desiredUnits).div(Util.ONE);

    const actualPrice = await sale.calculatePrice(desiredUnits);

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

    const { receipt } = (await Util.getEventArgs(
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
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const feeRecipient = signers[2];
    const signer1 = signers[3];

    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleTimeout = 30;
    const minimumRaise = ethers.BigNumber.from("100000").mul(Util.RESERVE_ONE);

    const totalTokenSupply = ethers.BigNumber.from("2000").mul(Util.ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };

    const basePrice = ethers.BigNumber.from("75").mul(Util.RESERVE_ONE);

    const constants = [basePrice];
    const vBasePrice = op(Opcode.VAL, 0);

    const sources = [
      concat([
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
        vmStateConfig: {
          sources,
          constants,
          stackLength: 3,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        startBlock,
        cooldownDuration: 1,
        saleTimeout,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    const desiredUnits0 = totalTokenSupply.div(10);
    const expectedPrice0 = basePrice.add(
      (await ethers.provider.getBlockNumber()) + 3
    ); // 2 blocks from now
    const expectedCost0 = expectedPrice0.mul(desiredUnits0).div(Util.ONE);

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

    const { receipt: receipt0 } = (await Util.getEventArgs(
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
    const expectedCost1 = expectedPrice1.mul(desiredUnits1).div(Util.ONE);

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

    const { receipt: receipt1 } = (await Util.getEventArgs(
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

  it("should prevent recipient claiming fees on failed raise, allowing buyers to refund their tokens", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const feeRecipient = signers[2];
    const signer1 = signers[3];

    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleTimeout = 30;
    const minimumRaise = ethers.BigNumber.from("100000").mul(Util.RESERVE_ONE);

    const totalTokenSupply = ethers.BigNumber.from("2000").mul(Util.ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };

    const staticPrice = ethers.BigNumber.from("75").mul(Util.RESERVE_ONE);

    const constants = [staticPrice];
    const vBasePrice = op(Opcode.VAL, 0);

    const sources = [concat([vBasePrice])];

    const [sale, token] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        vmStateConfig: {
          sources,
          constants,
          stackLength: 1,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        startBlock,
        cooldownDuration: 1,
        saleTimeout,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    const desiredUnits = totalTokenSupply.div(10);
    const cost = staticPrice.mul(desiredUnits).div(Util.ONE);

    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, cost.add(fee));

    await reserve
      .connect(signer1)
      .approve(sale.address, staticPrice.mul(desiredUnits).add(fee));

    // buy _some_ units; insufficient raise amount
    const txBuy = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnits,
      desiredUnits,
      maximumPrice: staticPrice,
    });

    const { receipt } = (await Util.getEventArgs(
      txBuy,
      "Buy",
      sale
    )) as BuyEvent["args"];

    // wait until sale can end
    await Util.createEmptyBlock(
      saleTimeout + startBlock - (await ethers.provider.getBlockNumber())
    );

    // recipient cannot claim before sale ended with status of success
    await Util.assertError(
      async () =>
        await sale.connect(feeRecipient).claimFees(feeRecipient.address),
      "NOT_SUCCESS",
      "fees were claimed before sale ended with status of success"
    );

    await sale.end();

    const saleStatusFail = await sale.saleStatus();

    assert(
      saleStatusFail === Status.FAIL,
      `wrong status
      expected  ${Status.FAIL}
      got       ${saleStatusFail}`
    );

    // recipient cannot claim after sale ended with status of fail
    await Util.assertError(
      async () =>
        await sale.connect(feeRecipient).claimFees(feeRecipient.address),
      "NOT_SUCCESS",
      "fees were claimed after sale ended with status of fail"
    );

    // signer1 gets refund
    await token.connect(signer1).approve(sale.address, receipt.units);
    await sale.connect(signer1).refund(receipt);
  });

  it("should allow recipient to claim fees on successful raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const feeRecipient = signers[2];
    const signer1 = signers[3];

    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleTimeout = 30;
    const minimumRaise = ethers.BigNumber.from("100000").mul(Util.RESERVE_ONE);

    const totalTokenSupply = ethers.BigNumber.from("2000").mul(Util.ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };

    const staticPrice = ethers.BigNumber.from("75").mul(Util.RESERVE_ONE);

    const constants = [staticPrice];
    const vBasePrice = op(Opcode.VAL, 0);

    const sources = [concat([vBasePrice])];

    const [sale] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        vmStateConfig: {
          sources,
          constants,
          stackLength: 1,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        startBlock,
        cooldownDuration: 1,
        saleTimeout,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    const desiredUnits = totalTokenSupply;
    const cost = staticPrice.mul(desiredUnits).div(Util.ONE);

    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, cost.add(fee));

    await reserve
      .connect(signer1)
      .approve(sale.address, staticPrice.mul(desiredUnits).add(fee));

    // buy all units to meet minimum raise amount
    await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnits,
      desiredUnits,
      maximumPrice: staticPrice,
    });

    // sale should automatically have ended after all units bought
    const saleStatusSuccess = await sale.saleStatus();

    assert(
      saleStatusSuccess === Status.SUCCESS,
      `wrong status
      expected  ${Status.SUCCESS}
      got       ${saleStatusSuccess}`
    );

    await sale.connect(feeRecipient).claimFees(feeRecipient.address);
  });

  it("should have status of Success if minimum raise met", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const feeRecipient = signers[2];
    const signer1 = signers[3];

    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleTimeout = 30;
    const minimumRaise = ethers.BigNumber.from("150000").mul(Util.RESERVE_ONE);

    const totalTokenSupply = ethers.BigNumber.from("2000").mul(Util.ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };

    const staticPrice = ethers.BigNumber.from("75").mul(Util.RESERVE_ONE);

    const constants = [staticPrice];
    const vBasePrice = op(Opcode.VAL, 0);

    const sources = [concat([vBasePrice])];

    const [sale] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        vmStateConfig: {
          sources,
          constants,
          stackLength: 1,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        startBlock,
        cooldownDuration: 1,
        saleTimeout,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
      }
    );

    const saleToken = await sale.token();
    const saleReserve = await sale.reserve();
    const saleStatusPending = await sale.saleStatus();

    assert(await redeemableERC20Factory.isChild(saleToken));
    assert(saleReserve === reserve.address);
    assert(saleStatusPending === Status.PENDING);

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    const desiredUnits = totalTokenSupply;
    const cost = staticPrice.mul(desiredUnits).div(Util.ONE);

    const price = await sale.calculatePrice(desiredUnits);

    assert(price.eq(75000000), "wrong price");

    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, cost.add(fee));

    const signer1ReserveBalance = await reserve.balanceOf(signer1.address);

    await Util.assertError(
      async () => {
        await sale.connect(signer1).buy({
          feeRecipient: feeRecipient.address,
          fee,
          minimumUnits: desiredUnits,
          desiredUnits,
          maximumPrice: staticPrice,
        });
      },
      "NOT_STARTED",
      "bought tokens before sale start"
    );

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    await reserve.connect(signer1).approve(sale.address, signer1ReserveBalance);

    await Util.assertError(
      async () => {
        await sale.connect(signer1).buy({
          feeRecipient: feeRecipient.address,
          fee,
          minimumUnits: desiredUnits,
          desiredUnits: 0,
          maximumPrice: staticPrice,
        });
      },
      "0_DESIRED",
      "bought with 0 desired units"
    );

    await Util.assertError(
      async () => {
        await sale.connect(signer1).buy({
          feeRecipient: feeRecipient.address,
          fee,
          minimumUnits: desiredUnits,
          desiredUnits: 1,
          maximumPrice: staticPrice,
        });
      },
      "MINIMUM_OVER_DESIRED",
      "bought greater than minimum desired number of units"
    );

    await Util.assertError(
      async () => {
        await sale.connect(signer1).buy({
          feeRecipient: feeRecipient.address,
          fee,
          minimumUnits: desiredUnits.mul(10),
          desiredUnits: desiredUnits.mul(20),
          maximumPrice: staticPrice,
        });
      },
      "INSUFFICIENT_STOCK",
      "bought more units than available"
    );

    await Util.assertError(
      async () => {
        await sale.connect(signer1).buy({
          feeRecipient: feeRecipient.address,
          fee,
          minimumUnits: desiredUnits,
          desiredUnits,
          maximumPrice: staticPrice.sub(1),
        });
      },
      "MAXIMUM_PRICE",
      "bought at price less than desired maximum price"
    );

    // ACTUALLY buy all units to meet minimum raise amount
    await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnits,
      desiredUnits,
      maximumPrice: staticPrice,
    });

    await Util.assertError(
      async () => {
        await sale.connect(signer1).buy({
          feeRecipient: feeRecipient.address,
          fee,
          minimumUnits: desiredUnits,
          desiredUnits,
          maximumPrice: staticPrice,
        });
      },
      "ENDED",
      "bought after all units sold"
    );

    const saleStatusSuccess = await sale.saleStatus();

    assert(
      saleStatusSuccess === Status.SUCCESS,
      `wrong status
      expected  ${Status.SUCCESS}
      got       ${saleStatusSuccess}`
    );

    const recipientFinalReserveBalance = await reserve.balanceOf(
      recipient.address
    );

    assert(
      recipientFinalReserveBalance.eq(minimumRaise),
      `recipient did not receive correct funds at end of successful raise
      expected  ${minimumRaise}
      got       ${recipientFinalReserveBalance}`
    );
  });

  it("should have status of Fail if minimum raise not met", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];

    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleTimeout = 30;
    const minimumRaise = ethers.BigNumber.from("150000").mul(Util.RESERVE_ONE);

    const totalTokenSupply = ethers.BigNumber.from("2000").mul(Util.ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };

    const staticPrice = ethers.BigNumber.from("75").mul(Util.RESERVE_ONE);

    const constants = [staticPrice];
    const vBasePrice = op(Opcode.VAL, 0);

    const sources = [concat([vBasePrice])];

    const [sale] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        vmStateConfig: {
          sources,
          constants,
          stackLength: 1,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        startBlock,
        cooldownDuration: 1,
        saleTimeout,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
      }
    );

    const saleToken = await sale.token();
    const saleReserve = await sale.reserve();
    const saleStatusPending = await sale.saleStatus();

    assert(await redeemableERC20Factory.isChild(saleToken));
    assert(saleReserve === reserve.address);
    assert(saleStatusPending === Status.PENDING);

    // wait until sale can end
    await Util.createEmptyBlock(
      saleTimeout + startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.end();

    const saleStatusFail = await sale.saleStatus();

    assert(
      saleStatusFail === Status.FAIL,
      `wrong status
      expected  ${Status.FAIL}
      got       ${saleStatusFail}`
    );
  });
});
