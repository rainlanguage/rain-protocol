import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { ReadWriteTier, ReserveToken, SaleFactory } from "../../typechain";
import { BuyEvent } from "../../typechain/contracts/sale/Sale";
import { zeroAddress } from "../../utils/constants/address";
import { max_uint256, ONE, RESERVE_ONE } from "../../utils/constants/bigNumber";
import deploy1820 from "../../utils/deploy/registry1820/deploy";
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
import { Status } from "../../utils/types/sale";
import { Tier } from "../../utils/types/tier";

const Opcode = AllStandardOps;

describe("Sale refund", async function () {
  let reserve: ReserveToken,
    readWriteTier: ReadWriteTier,
    saleFactory: SaleFactory;
  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    ({ readWriteTier, saleFactory } = await saleDependenciesDeploy());
  });

  beforeEach(async () => {
    reserve = await reserveDeploy();
  });

  it("should prevent refunding with modified receipt", async function () {
    const signers = await ethers.getSigners();
    const [deployer, recipient, signer1, feeRecipient] = signers;
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
    const evaluableConfig = await generateEvaluableConfig(sources, constants);
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
    const txBuy = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: 10,
      desiredUnits: 10,
      maximumPrice: staticPrice,
    });
    const { receipt } = (await getEventArgs(
      txBuy,
      "Buy",
      sale
    )) as BuyEvent["args"];
    await token.connect(signer1).approve(sale.address, receipt.units);
    await assertError(
      async () =>
        await sale
          .connect(signer1)
          .refund({ ...receipt, units: receipt.units.add(1) }),
      "Error",
      "wrongly allowed accepted receipt with modified units for refund request"
    );
    await assertError(
      async () => await sale.connect(signer1).refund({ ...receipt, fee: 0 }),
      "Error",
      "wrongly allowed accepted receipt with modified fee for refund request"
    );
    await assertError(
      async () =>
        await sale
          .connect(signer1)
          .refund({ ...receipt, price: receipt.price.mul(2) }),
      "Error",
      "wrongly allowed accepted receipt with modified price for refund request"
    );
  });

  it("should prevent refunding with someone else's receipt", async function () {
    const signers = await ethers.getSigners();
    const [deployer, recipient, signer1, signer2, feeRecipient] = signers;
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
    const evaluableConfig = await generateEvaluableConfig(sources, constants);
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
    // give signers reserve to cover cost + fee
    await reserve.transfer(signer1.address, cost.add(fee));
    await reserve.transfer(signer2.address, cost.add(fee));
    const signer1ReserveBalance = await reserve.balanceOf(signer1.address);
    const signer2ReserveBalance = await reserve.balanceOf(signer2.address);
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
    const { receipt: receipt1 } = (await getEventArgs(
      txBuy1,
      "Buy",
      sale
    )) as BuyEvent["args"];
    const { receipt: receipt2 } = (await getEventArgs(
      txBuy2,
      "Buy",
      sale
    )) as BuyEvent["args"];
    await token.connect(signer1).approve(sale.address, receipt2.units);
    await token.connect(signer2).approve(sale.address, receipt1.units);
    await assertError(
      async () => await sale.connect(signer1).refund(receipt2),
      "Error",
      "wrongly allowed signer1 to use signer2's receipt for refund"
    );
    await assertError(
      async () => await sale.connect(signer2).refund(receipt1),
      "Error",
      "wrongly allowed signer2 to use signer1's receipt for refund"
    );
  });

  it("should prevent refunding twice with same receipt", async function () {
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
    const evaluableConfig = await generateEvaluableConfig(sources, constants);
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
    const txBuy = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: 10,
      desiredUnits: 10,
      maximumPrice: staticPrice,
    });
    const { receipt } = (await getEventArgs(
      txBuy,
      "Buy",
      sale
    )) as BuyEvent["args"];
    await token.connect(signer1).approve(sale.address, receipt.units);
    await sale.connect(signer1).refund(receipt);
    await assertError(
      async () => await sale.connect(signer1).refund(receipt),
      "Error",
      "wrongly allowed same receipt to be used twice for refund"
    );
  });

  it("should respect refund cooldown when sale is active, and bypass refund cooldown when sale is fail", async function () {
    const signers = await ethers.getSigners();
    const [deployer, recipient, signer1, feeRecipient] = signers;
    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleDuration = 50;
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
    const cooldownDuration = 5;
    const evaluableConfig = await generateEvaluableConfig(sources, constants);
    const [sale, token] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        evaluableConfig,
        recipient: recipient.address,
        reserve: reserve.address,
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
    await token.connect(signer1).approve(sale.address, max_uint256); // infinite approve for refunds
    // buy some units
    const txBuy0 = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: 10,
      desiredUnits: 10,
      maximumPrice: staticPrice,
    });
    const { receipt: receipt0 } = (await getEventArgs(
      txBuy0,
      "Buy",
      sale
    )) as BuyEvent["args"];
    await createEmptyBlock(cooldownDuration);
    // buy some more units
    const txBuy1 = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: 10,
      desiredUnits: 10,
      maximumPrice: staticPrice,
    });
    const { receipt: receipt1 } = (await getEventArgs(
      txBuy1,
      "Buy",
      sale
    )) as BuyEvent["args"];
    await createEmptyBlock(cooldownDuration); // same cooldown applies across buy and refund functions, i.e. buying also triggers cooldown for refund, and vice versa
    // attempt to refund receipt0 and receipt1 consecutively
    await sale.connect(signer1).refund(receipt0);
    await assertError(
      async () => await sale.connect(signer1).refund(receipt1),
      "COOLDOWN",
      "did not respect refund cooldown while sale was active"
    );
    await createEmptyBlock(cooldownDuration);
    // only now can second refund go ahead
    await sale.connect(signer1).refund(receipt1);
    // prepare more receipts for after sale ends with fail
    await createEmptyBlock(cooldownDuration);
    // buy some more units
    const txBuy2 = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: 10,
      desiredUnits: 10,
      maximumPrice: staticPrice,
    });
    const { receipt: receipt2 } = (await getEventArgs(
      txBuy2,
      "Buy",
      sale
    )) as BuyEvent["args"];
    await createEmptyBlock(cooldownDuration);
    // buy some more units
    const txBuy3 = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: 10,
      desiredUnits: 10,
      maximumPrice: staticPrice,
    });
    const { receipt: receipt3 } = (await getEventArgs(
      txBuy3,
      "Buy",
      sale
    )) as BuyEvent["args"];
    // wait until sale can end
    await createEmptyBlock(
      saleDuration + startBlock - (await ethers.provider.getBlockNumber())
    );
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
});
