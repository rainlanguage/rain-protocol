import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  ReadWriteTier,
  RedeemableERC20Factory,
  ReserveToken,
  SaleFactory,
} from "../../typechain";
import {
  BuyEvent,
  EndEvent,
  InitializeEvent,
  StartEvent,
} from "../../typechain/contracts/sale/Sale";
import { zeroAddress } from "../../utils/constants/address";
import { ONE, RESERVE_ONE } from "../../utils/constants/bigNumber";
import {
  saleDependenciesDeploy,
  saleDeploy,
} from "../../utils/deploy/sale/deploy";
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
import { compareStructs } from "../../utils/test/compareStructs";
import { Status } from "../../utils/types/sale";
import { Tier } from "../../utils/types/tier";

const Opcode = AllStandardOps;

describe("Sale minimum raise", async function () {
  let reserve: ReserveToken,
    redeemableERC20Factory: RedeemableERC20Factory,
    readWriteTier: ReadWriteTier,
    saleFactory: SaleFactory;
  before(async () => {
    ({ redeemableERC20Factory, readWriteTier, saleFactory } =
      await saleDependenciesDeploy());
  });

  beforeEach(async () => {
    reserve = await reserveDeploy();
  });

  it("should have status of Success if minimum raise met, and also ensure that refunding is disallowed", async function () {
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
      concat([op(Opcode.context, 0x0001), vBasePrice]),
      concat([]),
    ];
    const saleTimeout = 100;
    const evaluableConfig = await generateEvaluableConfig({
      sources,
      constants,
    });
    const [sale, token] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        evaluableConfig,
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration: 1,
        minimumRaise,
        dustSize: 0,
        saleTimeout,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );
    const afterInitializeBlock = await ethers.provider.getBlockNumber();
    const saleToken = await sale.token();
    const saleReserve = await sale.reserve();
    const saleStatusPending = await sale.saleStatus();
    assert(await redeemableERC20Factory.isChild(saleToken));
    assert(saleReserve === reserve.address);
    assert(saleStatusPending === Status.PENDING);
    const fee = ethers.BigNumber.from("1").mul(RESERVE_ONE);
    const desiredUnits = totalTokenSupply;
    const cost = staticPrice.mul(desiredUnits).div(ONE);
    const [, price] = await sale.previewCalculateBuy(desiredUnits);
    assert(price.eq(75000000), "wrong price");
    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, cost.add(fee));
    const signer1ReserveBalance = await reserve.balanceOf(signer1.address);
    await assertError(
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
    await createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );
    await sale.start();
    await reserve.connect(signer1).approve(sale.address, signer1ReserveBalance);
    await assertError(
      async () => {
        await sale.connect(signer1).buy({
          feeRecipient: feeRecipient.address,
          fee,
          minimumUnits: 0,
          desiredUnits: desiredUnits,
          maximumPrice: staticPrice,
        });
      },
      "0_MINIMUM",
      "bought with 0 minimum units"
    );
    await assertError(
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
    await assertError(
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
    await assertError(
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
    const { receipt } = (await getEventArgs(
      txBuy,
      "Buy",
      sale
    )) as BuyEvent["args"];
    await assertError(
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
    await assertError(
      async () => await sale.connect(signer1).refund(receipt),
      "REFUND_SUCCESS",
      "signer1 wrongly refunded when raise was Successful"
    );
    await createEmptyBlock(
      saleTimeout +
        afterInitializeBlock -
        (await ethers.provider.getBlockNumber())
    );
    await assertError(
      async () => await sale.timeout(),
      "ALREADY_ENDED",
      "wrongly timed out sale with sale status of Success"
    );
    // Cannot start, end or buy from sale
    await assertError(
      async () => await sale.start(),
      "NOT_PENDING",
      "wrongly started in Success state"
    );
    await assertError(
      async () => await sale.end(),
      "NOT_ACTIVE",
      "wrongly ended in Success state"
    );
    await assertError(
      async () => {
        await sale.buy({
          feeRecipient: feeRecipient.address,
          fee,
          minimumUnits: desiredUnits,
          desiredUnits,
          maximumPrice: staticPrice,
        });
      },
      "NOT_ACTIVE",
      "wrongly bought units when sale is in Success state"
    );
  });

  it("should have status of Fail if minimum raise not met", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const signer1 = signers[2];
    const feeRecipient = signers[3];
    // 7 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 7;
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
      concat([op(Opcode.context, 0x0001), vBasePrice]),
      concat([]),
    ];
    const saleTimeout = 100;
    const evaluableConfig = await generateEvaluableConfig({
      sources,
      constants,
    });
    const saleConfig = {
      evaluableConfig,
      recipient: recipient.address,
      reserve: reserve.address,
      cooldownDuration: 1,
      minimumRaise,
      dustSize: 0,
      saleTimeout,
    };

    const [sale] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      saleConfig,
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );
    const afterInitializeBlock = await ethers.provider.getBlockNumber();
    const { sender, config, token } = (await getEventArgs(
      sale.deployTransaction,
      "Initialize",
      sale
    )) as InitializeEvent["args"];

    compareStructs(config, saleConfig);
    assert(sender === saleFactory.address, "wrong sender in Initialize event");
    const saleToken = await sale.token();
    assert(saleToken === token, "wrong token in Initialize event");
    const saleReserve = await sale.reserve();
    const saleStatusPending = await sale.saleStatus();
    assert(await redeemableERC20Factory.isChild(saleToken));
    assert(saleReserve === reserve.address);
    assert(saleStatusPending === Status.PENDING);
    const cantStart = await sale.previewCanLive();
    assert(!cantStart);
    await assertError(
      async () => await sale.start(),
      "NOT_LIVE",
      "wrongly started before configured block number"
    );
    // wait until sale start
    await createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    const previewCanLive = await sale.previewCanLive();
    assert(previewCanLive);

    await assertError(
      async () => await sale.end(),
      "NOT_ACTIVE",
      "wrongly ended before started"
    );
    // anon can start sale
    const startTx = await sale.connect(signer1).start();
    const { sender: senderStart } = (await getEventArgs(
      startTx,
      "Start",
      sale
    )) as StartEvent["args"];
    assert(senderStart === signer1.address, "wrong Start sender");
    const saleStatusActive = await sale.saleStatus();
    assert(saleStatusActive === Status.ACTIVE);
    await assertError(
      async () => await sale.start(),
      "NOT_PENDING",
      "wrongly re-started while with Status of ACTIVE"
    );

    const cantEnd = await sale.previewCanLive();
    assert(cantEnd); // cannot end if Sale can live

    await assertError(
      async () => await sale.end(),
      "LIVE",
      "wrongly ended before configured block number"
    );
    // wait until sale can end
    await createEmptyBlock(
      saleDuration + startBlock - (await ethers.provider.getBlockNumber())
    );

    const canEnd = !(await sale.previewCanLive());
    assert(canEnd); // can end if Sale should no longer live

    // anon can end sale
    const endTx = await sale.connect(signer1).end();
    const { sender: senderEnd, saleStatus: saleStatusEnd } =
      (await getEventArgs(endTx, "End", sale)) as EndEvent["args"];
    assert(senderEnd === signer1.address, "wrong End sender");
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
    // Cannot start, end or buy from sale
    await assertError(
      async () => await sale.start(),
      "NOT_PENDING",
      "wrongly started in Fail state"
    );
    await assertError(
      async () => await sale.end(),
      "NOT_ACTIVE",
      "wrongly ended in Fail state"
    );
    const fee = ethers.BigNumber.from("1").mul(RESERVE_ONE);
    const desiredUnits = totalTokenSupply;
    await assertError(
      async () => {
        await sale.buy({
          feeRecipient: feeRecipient.address,
          fee,
          minimumUnits: desiredUnits,
          desiredUnits,
          maximumPrice: staticPrice,
        });
      },
      "NOT_ACTIVE",
      "wrongly bought units when sale is in Fail state"
    );
    await createEmptyBlock(
      saleTimeout +
        afterInitializeBlock -
        (await ethers.provider.getBlockNumber())
    );
    await assertError(
      async () => await sale.timeout(),
      "ALREADY_ENDED",
      "wrongly timed out sale with sale status of Fail"
    );
  });
});
