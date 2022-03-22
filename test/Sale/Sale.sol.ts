import * as Util from "../Util";
import chai from "chai";
import { artifacts, ethers } from "hardhat";
import type { Contract, ContractFactory } from "ethers";
import type {
  SaleConstructorConfigStruct,
  SaleFactory,
} from "../../typechain/SaleFactory";
import type {
  BuyEvent,
  ConstructEvent,
  EndEvent,
  InitializeEvent,
  RefundEvent,
  Sale,
  StartEvent,
} from "../../typechain/Sale";
import { op } from "../Util";
import { ReserveToken } from "../../typechain/ReserveToken";
import { ReadWriteTier } from "../../typechain/ReadWriteTier";
import { RedeemableERC20Factory } from "../../typechain/RedeemableERC20Factory";
import { SaleReentrant } from "../../typechain/SaleReentrant";
import { concat } from "ethers/lib/utils";
import {
  afterBlockNumberConfig,
  saleDeploy,
  Opcode,
  Status,
  Tier,
} from "./SaleUtil";

const { assert } = chai;

let reserve: ReserveToken & Contract,
  redeemableERC20FactoryFactory: ContractFactory,
  redeemableERC20Factory: RedeemableERC20Factory & Contract,
  readWriteTierFactory: ContractFactory,
  readWriteTier: ReadWriteTier & Contract,
  saleConstructorConfig: SaleConstructorConfigStruct,
  saleFactoryFactory: ContractFactory,
  saleFactory: SaleFactory & Contract,
  saleProxy: Sale & Contract;

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
      maximumCooldownDuration: 1000,
      redeemableERC20Factory: redeemableERC20Factory.address,
    };

    saleFactoryFactory = await ethers.getContractFactory("SaleFactory", {});
    saleFactory = (await saleFactoryFactory.deploy(
      saleConstructorConfig
    )) as SaleFactory & Contract;
    await saleFactory.deployed();

    const { implementation, sender } = await Util.getEventArgs(
      saleFactory.deployTransaction,
      "Implementation",
      saleFactory
    );

    assert(sender === (await ethers.getSigners())[0].address, "wrong sender");

    saleProxy = new ethers.Contract(
      implementation,
      (await artifacts.readArtifact("Sale")).abi
    ) as Sale & Contract;

    const { sender: senderProxy, config } = (await Util.getEventArgs(
      saleFactory.deployTransaction,
      "Construct",
      saleProxy
    )) as ConstructEvent["args"];

    assert(senderProxy === saleFactory.address, "wrong proxy sender");

    assert(
      config.redeemableERC20Factory === redeemableERC20Factory.address,
      "wrong redeemableERC20Factory in SaleConstructorConfig"
    );
  });

  it("should prevent reentrant buys", async function () {
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

    const cooldownDuration = 5;

    const maliciousReserveFactory = await ethers.getContractFactory(
      "SaleReentrant"
    );

    const maliciousReserve =
      (await maliciousReserveFactory.deploy()) as SaleReentrant & Contract;

    // If cooldown could be set to zero, reentrant buy calls would be possible.
    await Util.assertError(
      async () =>
        await saleDeploy(
          signers,
          deployer,
          saleFactory,
          {
            canStartStateConfig: afterBlockNumberConfig(startBlock),
            canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
            calculatePriceStateConfig: {
              sources,
              constants,
              stackLength: 1,
              argumentsLength: 0,
            },
            recipient: recipient.address,
            reserve: maliciousReserve.address,
            cooldownDuration: 0, // zero
            minimumRaise,
            dustSize: 0,
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
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
        calculatePriceStateConfig: {
          sources,
          constants,
          stackLength: 1,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: maliciousReserve.address,
        cooldownDuration,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    const desiredUnits = totalTokenSupply;
    const cost = staticPrice.mul(desiredUnits).div(Util.ONE);

    // give signer1 reserve to cover cost + fee
    await maliciousReserve.transfer(signer1.address, cost.add(fee));

    const signer1ReserveBalance = await maliciousReserve.balanceOf(
      signer1.address
    );

    // wait until sale start
    await Util.createEmptyBlock(
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
    await Util.assertError(
      async () => await sale.connect(signer1).buy(buyConfig),
      "COOLDOWN",
      "Cooldown (with non-zero configured cooldown duration) did not revert reentrant buy call"
    );
  });

  it("should correctly generate receipts", async function () {
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
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
        calculatePriceStateConfig: {
          sources,
          constants,
          stackLength: 1,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration: 1,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    const desiredUnits = totalTokenSupply;
    const cost = staticPrice.mul(desiredUnits).div(Util.ONE);

    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, cost.add(fee));

    const signer1ReserveBalance = await reserve.balanceOf(signer1.address);

    // wait until sale start
    await Util.createEmptyBlock(
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

    const { receipt: receipt0 } = (await Util.getEventArgs(
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

    const { receipt: receipt1 } = (await Util.getEventArgs(
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

    const { receipt: receipt2 } = (await Util.getEventArgs(
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

  it("should prevent refunding with modified receipt", async function () {
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

    const [sale, token] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
        calculatePriceStateConfig: {
          sources,
          constants,
          stackLength: 1,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration: 1,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    const desiredUnits = totalTokenSupply;
    const cost = staticPrice.mul(desiredUnits).div(Util.ONE);

    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, cost.add(fee));

    const signer1ReserveBalance = await reserve.balanceOf(signer1.address);

    // wait until sale start
    await Util.createEmptyBlock(
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
    const txBuy = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: 10,
      desiredUnits: 10,
      maximumPrice: staticPrice,
    });

    const { receipt } = (await Util.getEventArgs(
      txBuy,
      "Buy",
      sale
    )) as BuyEvent["args"];

    await token.connect(signer1).approve(sale.address, receipt.units);

    await Util.assertError(
      async () =>
        await sale
          .connect(signer1)
          .refund({ ...receipt, units: receipt.units.add(1) }),
      "INVALID_RECEIPT",
      "wrongly allowed accepted receipt with modified units for refund request"
    );
    await Util.assertError(
      async () => await sale.connect(signer1).refund({ ...receipt, fee: 0 }),
      "INVALID_RECEIPT",
      "wrongly allowed accepted receipt with modified fee for refund request"
    );
    await Util.assertError(
      async () =>
        await sale
          .connect(signer1)
          .refund({ ...receipt, price: receipt.price.mul(2) }),
      "INVALID_RECEIPT",
      "wrongly allowed accepted receipt with modified price for refund request"
    );
  });

  it("should prevent refunding with someone else's receipt", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const feeRecipient = signers[2];
    const signer1 = signers[3];
    const signer2 = signers[4];

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

    const [sale, token] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
        calculatePriceStateConfig: {
          sources,
          constants,
          stackLength: 1,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration: 1,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    const desiredUnits = totalTokenSupply;
    const cost = staticPrice.mul(desiredUnits).div(Util.ONE);

    // give signers reserve to cover cost + fee
    await reserve.transfer(signer1.address, cost.add(fee));
    await reserve.transfer(signer2.address, cost.add(fee));

    const signer1ReserveBalance = await reserve.balanceOf(signer1.address);
    const signer2ReserveBalance = await reserve.balanceOf(signer2.address);

    // wait until sale start
    await Util.createEmptyBlock(
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
    await reserve.connect(signer2).approve(sale.address, signer2ReserveBalance);

    // buy some units
    const txBuy1 = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: 10,
      desiredUnits: 10,
      maximumPrice: staticPrice,
    });
    const txBuy2 = await sale.connect(signer2).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: 10,
      desiredUnits: 10,
      maximumPrice: staticPrice,
    });

    const { receipt: receipt1 } = (await Util.getEventArgs(
      txBuy1,
      "Buy",
      sale
    )) as BuyEvent["args"];
    const { receipt: receipt2 } = (await Util.getEventArgs(
      txBuy2,
      "Buy",
      sale
    )) as BuyEvent["args"];

    await token.connect(signer1).approve(sale.address, receipt2.units);
    await token.connect(signer2).approve(sale.address, receipt1.units);

    await Util.assertError(
      async () => await sale.connect(signer1).refund(receipt2),
      "INVALID_RECEIPT",
      "wrongly allowed signer1 to use signer2's receipt for refund"
    );
    await Util.assertError(
      async () => await sale.connect(signer2).refund(receipt1),
      "INVALID_RECEIPT",
      "wrongly allowed signer2 to use signer1's receipt for refund"
    );
  });

  it("should prevent refunding twice with same receipt", async function () {
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

    const [sale, token] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
        calculatePriceStateConfig: {
          sources,
          constants,
          stackLength: 1,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration: 1,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    const desiredUnits = totalTokenSupply;
    const cost = staticPrice.mul(desiredUnits).div(Util.ONE);

    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, cost.add(fee));

    const signer1ReserveBalance = await reserve.balanceOf(signer1.address);

    // wait until sale start
    await Util.createEmptyBlock(
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
    const txBuy = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: 10,
      desiredUnits: 10,
      maximumPrice: staticPrice,
    });

    const { receipt } = (await Util.getEventArgs(
      txBuy,
      "Buy",
      sale
    )) as BuyEvent["args"];

    await token.connect(signer1).approve(sale.address, receipt.units);

    await sale.connect(signer1).refund(receipt);

    await Util.assertError(
      async () => await sale.connect(signer1).refund(receipt),
      "INVALID_RECEIPT",
      "wrongly allowed same receipt to be used twice for refund"
    );
  });

  it("should respect refund cooldown when sale is active, and bypass refund cooldown when sale is fail", async function () {
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

    const cooldownDuration = 5;

    const [sale, token] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
        calculatePriceStateConfig: {
          sources,
          constants,
          stackLength: 1,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    const desiredUnits = totalTokenSupply;
    const cost = staticPrice.mul(desiredUnits).div(Util.ONE);

    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, cost.add(fee));

    const signer1ReserveBalance = await reserve.balanceOf(signer1.address);

    // wait until sale start
    await Util.createEmptyBlock(
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
    await token.connect(signer1).approve(sale.address, Util.max_uint256); // infinite approve for refunds

    // buy some units
    const txBuy0 = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: 10,
      desiredUnits: 10,
      maximumPrice: staticPrice,
    });

    const { receipt: receipt0 } = (await Util.getEventArgs(
      txBuy0,
      "Buy",
      sale
    )) as BuyEvent["args"];

    await Util.createEmptyBlock(cooldownDuration);

    // buy some more units
    const txBuy1 = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: 10,
      desiredUnits: 10,
      maximumPrice: staticPrice,
    });

    const { receipt: receipt1 } = (await Util.getEventArgs(
      txBuy1,
      "Buy",
      sale
    )) as BuyEvent["args"];

    await Util.createEmptyBlock(cooldownDuration); // same cooldown applies across buy and refund functions, i.e. buying also triggers cooldown for refund, and vice versa

    // attempt to refund receipt0 and receipt1 consecutively
    await sale.connect(signer1).refund(receipt0);
    await Util.assertError(
      async () => await sale.connect(signer1).refund(receipt1),
      "COOLDOWN",
      "did not respect refund cooldown while sale was active"
    );

    await Util.createEmptyBlock(cooldownDuration);

    // only now can second refund go ahead
    await sale.connect(signer1).refund(receipt1);

    // prepare more receipts for after sale ends with fail

    await Util.createEmptyBlock(cooldownDuration);

    // buy some more units
    const txBuy2 = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: 10,
      desiredUnits: 10,
      maximumPrice: staticPrice,
    });

    const { receipt: receipt2 } = (await Util.getEventArgs(
      txBuy2,
      "Buy",
      sale
    )) as BuyEvent["args"];

    await Util.createEmptyBlock(cooldownDuration);

    // buy some more units
    const txBuy3 = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: 10,
      desiredUnits: 10,
      maximumPrice: staticPrice,
    });

    const { receipt: receipt3 } = (await Util.getEventArgs(
      txBuy3,
      "Buy",
      sale
    )) as BuyEvent["args"];

    await sale.end();

    const saleStatusFail = await sale.saleStatus();

    assert(
      saleStatusFail === Status.FAIL,
      `wrong status
      expected  ${Status.FAIL}
      got       ${saleStatusFail}`
    );

    // should be able to refund receipt2 and receipt3 consecutively, as cooldown is bypassed on failed sale
    await sale.connect(signer1).refund(receipt2);
    await sale.connect(signer1).refund(receipt3);
  });

  it("should respect buy cooldown when sale is active", async function () {
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
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
        calculatePriceStateConfig: {
          sources,
          constants,
          stackLength: 1,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration: 5,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    const desiredUnits = totalTokenSupply;
    const cost = staticPrice.mul(desiredUnits).div(Util.ONE);

    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, cost.add(fee));

    const signer1ReserveBalance = await reserve.balanceOf(signer1.address);

    // wait until sale start
    await Util.createEmptyBlock(
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
    await Util.assertError(
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

  it("should limit maximum cooldown duration in the factory", async function () {
    const signers = await ethers.getSigners();
    const basePrice = ethers.BigNumber.from("100").mul(Util.RESERVE_ONE);
    const constants = [basePrice];
    const sources = [concat([op(Opcode.VAL, 0)])];
    await Util.assertError(
      async () =>
        await saleDeploy(
          signers,
          signers[0],
          saleFactory,
          {
            canStartStateConfig: afterBlockNumberConfig(50),
            canEndStateConfig: afterBlockNumberConfig(50 + 1000000),
            calculatePriceStateConfig: {
              sources,
              constants,
              stackLength: 1,
              argumentsLength: 0,
            },
            recipient: signers[1].address,
            reserve: reserve.address,
            cooldownDuration: 1000000,
            minimumRaise: 100,
            dustSize: 0,
          },
          {
            erc20Config: {
              name: "foo",
              symbol: "FOO",
              distributor: Util.zeroAddress,
              initialSupply: 100,
            },
            tier: readWriteTier.address,
            minimumTier: Tier.ZERO,
            distributionEndForwardingAddress: ethers.constants.AddressZero,
          }
        ),
      "MAX_COOLDOWN",
      "did not prevent maximum cooldown on deploy"
    );
  });

  it("should dynamically calculate price (discount off base price based on proportion of ERC20 token currently held by buyer)", async function () {
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

    const basePrice = ethers.BigNumber.from("100").mul(Util.RESERVE_ONE);
    const balanceMultiplier = ethers.BigNumber.from("100").mul(
      Util.RESERVE_ONE
    );

    const constants = [basePrice, balanceMultiplier];
    const vBasePrice = op(Opcode.VAL, 0);
    const vFractionMultiplier = op(Opcode.VAL, 1);

    // prettier-ignore
    const sources = [
      concat([
          vBasePrice,
              vFractionMultiplier,
                op(Opcode.TOKEN_ADDRESS),
                op(Opcode.SENDER),
              op(Opcode.ERC20_BALANCE_OF),
            op(Opcode.MUL, 2),
              op(Opcode.TOKEN_ADDRESS),
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
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
        calculatePriceStateConfig: {
          sources,
          constants,
          stackLength: 6,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration: 1,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.start();

    const signer1Balance0 = await token.balanceOf(signer1.address);

    const desiredUnits0 = totalTokenSupply.div(10);
    const expectedPrice0 = basePrice.sub(
      signer1Balance0.mul(balanceMultiplier).div(totalTokenSupply)
    );

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

    const signer1Balance1 = await token.balanceOf(signer1.address);

    const desiredUnits1 = totalTokenSupply.div(10);
    const expectedPrice1 = basePrice.sub(
      signer1Balance1.mul(balanceMultiplier).div(totalTokenSupply)
    );
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

  it("should dynamically calculate price (discount off base price based on proportion of ERC20 reserve currently held by buyer)", async function () {
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

    const basePrice = ethers.BigNumber.from("100").mul(Util.RESERVE_ONE);
    const balanceMultiplier = ethers.BigNumber.from("100").mul(
      Util.RESERVE_ONE
    );

    const constants = [basePrice, balanceMultiplier];
    const vBasePrice = op(Opcode.VAL, 0);
    const vFractionMultiplier = op(Opcode.VAL, 1);

    // prettier-ignore
    const sources = [
      concat([
          vBasePrice,
              vFractionMultiplier,
                op(Opcode.RESERVE_ADDRESS),
                op(Opcode.SENDER),
              op(Opcode.ERC20_BALANCE_OF),
            op(Opcode.MUL, 2),
              op(Opcode.RESERVE_ADDRESS),
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
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
        calculatePriceStateConfig: {
          sources,
          constants,
          stackLength: 6,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration: 1,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    // wait until sale start
    await Util.createEmptyBlock(
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
    const expectedCost0 = expectedPrice0.mul(desiredUnits0).div(Util.ONE);

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

    const signer1Balance1 = await reserve.balanceOf(signer1.address);

    const desiredUnits1 = totalTokenSupply.div(10);
    const expectedPrice1 = basePrice.sub(
      signer1Balance1.mul(balanceMultiplier).div(totalReserve)
    );
    const expectedCost1 = expectedPrice1.mul(desiredUnits1).div(Util.ONE);

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

  it("should prevent out of bounds opcode call", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];

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

    const constants = [];

    const sources = [concat([op(99)])]; // bad source

    const [sale] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
        calculatePriceStateConfig: {
          sources,
          constants,
          stackLength: 3,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration: 1,
        minimumRaise,
        dustSize,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );

    const desiredUnits = totalTokenSupply.add(1).sub(dustSize);

    await Util.assertError(
      async () => await sale.calculatePrice(desiredUnits),
      "MAX_OPCODE",
      "did not prevent out of bounds opcode call"
    );
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
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
        calculatePriceStateConfig: {
          sources,
          constants,
          stackLength: 3,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration: 1,
        minimumRaise,
        dustSize,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.start();

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
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
        calculatePriceStateConfig: {
          sources,
          constants,
          stackLength: 3,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration: 1,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.start();

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
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
        calculatePriceStateConfig: {
          sources,
          constants,
          stackLength: 3,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration: 1,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.start();

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
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
        calculatePriceStateConfig: {
          sources,
          constants,
          stackLength: 3,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration: 1,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.start();

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
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
        calculatePriceStateConfig: {
          sources,
          constants,
          stackLength: 3,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration: 1,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.start();

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
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
        calculatePriceStateConfig: {
          sources,
          constants,
          stackLength: 3,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration: 1,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.start();

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
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
        calculatePriceStateConfig: {
          sources,
          constants,
          stackLength: 1,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration: 1,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.start();

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

    await token.connect(signer1).approve(sale.address, receipt.units);

    await Util.assertError(
      async () => await sale.connect(signer1).refund({ ...receipt, id: 123 }),
      "INVALID_RECEIPT",
      "wrongly processed refund with invalid receipt"
    );

    // signer1 gets refund
    const refundTx = await sale.connect(signer1).refund(receipt);

    const { sender, receipt: eventReceipt } = (await Util.getEventArgs(
      refundTx,
      "Refund",
      sale
    )) as RefundEvent["args"];

    assert(sender === signer1.address, "wrong sender in Refund event");
    assert(
      JSON.stringify(eventReceipt) === JSON.stringify(receipt),
      "wrong receipt in Refund event"
    );
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
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
        calculatePriceStateConfig: {
          sources,
          constants,
          stackLength: 1,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration: 1,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.start();

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

    const feeRecipientBalance0 = await reserve.balanceOf(feeRecipient.address);

    await sale.connect(feeRecipient).claimFees(feeRecipient.address);

    const feeRecipientBalance1 = await reserve.balanceOf(feeRecipient.address);

    // claiming again should not change feeRecipient balance as `fees[recipient_]` was deleted
    await sale.connect(feeRecipient).claimFees(feeRecipient.address);

    const feeRecipientBalance2 = await reserve.balanceOf(feeRecipient.address);

    assert(feeRecipientBalance0.eq(0));
    assert(feeRecipientBalance1.eq(fee));
    assert(feeRecipientBalance2.eq(feeRecipientBalance1));
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

    const [sale, token] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
        calculatePriceStateConfig: {
          sources,
          constants,
          stackLength: 1,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration: 1,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: ethers.constants.AddressZero,
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
      "NOT_ACTIVE",
      "bought tokens before sale start"
    );

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.start();

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
      "NOT_ACTIVE",
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

    // signer1 attempts refund
    await token.connect(signer1).approve(sale.address, receipt.units);
    await Util.assertError(
      async () => await sale.connect(signer1).refund(receipt),
      "REFUND_SUCCESS",
      "signer1 wrongly refunded when raise was Successful"
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
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
        calculatePriceStateConfig: {
          sources,
          constants,
          stackLength: 1,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration: 1,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );

    const { sender, config, token } = (await Util.getEventArgs(
      sale.deployTransaction,
      "Initialize",
      sale
    )) as InitializeEvent["args"];

    console.log({ initializeConfig: config }); // just eyeball the log I can't be bothered to test object equivalence

    assert(sender === saleFactory.address, "wrong sender in Initialize event");

    const saleToken = await sale.token();

    assert(saleToken === token, "wrong token in Initialize event");

    const saleReserve = await sale.reserve();
    const saleStatusPending = await sale.saleStatus();

    assert(await redeemableERC20Factory.isChild(saleToken));
    assert(saleReserve === reserve.address);
    assert(saleStatusPending === Status.PENDING);

    const cantStart = await sale.canStart();
    assert(!cantStart);

    await Util.assertError(
      async () => await sale.start(),
      "CANT_START",
      "wrongly started before configured block number"
    );

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    const canStart = await sale.canStart();
    assert(canStart);

    await Util.assertError(
      async () => await sale.end(),
      "CANT_END",
      "wrongly ended before started"
    );

    const startTx = await sale.start();

    const { sender: senderStart } = (await Util.getEventArgs(
      startTx,
      "Start",
      sale
    )) as StartEvent["args"];

    assert(senderStart === signers[0].address, "wrong Start sender");

    const saleStatusActive = await sale.saleStatus();
    assert(saleStatusActive === Status.ACTIVE);

    await Util.assertError(
      async () => await sale.start(),
      "CANT_START",
      "wrongly re-started while with Status of ACTIVE"
    );

    const cantEnd = await sale.canEnd();
    assert(!cantEnd);

    await Util.assertError(
      async () => await sale.end(),
      "CANT_END",
      "wrongly ended before configured block number"
    );

    // wait until sale can end
    await Util.createEmptyBlock(
      saleTimeout + startBlock - (await ethers.provider.getBlockNumber())
    );

    const canEnd = await sale.canEnd();
    assert(canEnd);

    const endTx = await sale.end();

    const { sender: senderEnd, saleStatus: saleStatusEnd } =
      (await Util.getEventArgs(endTx, "End", sale)) as EndEvent["args"];

    assert(senderEnd === signers[0].address, "wrong End sender");
    assert(
      saleStatusEnd === Status.FAIL,
      `wrong status in event
      expected  ${Status.FAIL}
      got       ${saleStatusEnd}`
    );

    const saleStatusFail = await sale.saleStatus();

    assert(
      saleStatusFail === Status.FAIL,
      `wrong status in getter
      expected  ${Status.FAIL}
      got       ${saleStatusFail}`
    );
  });
});
