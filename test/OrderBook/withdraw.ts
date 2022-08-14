import { assert } from "chai";
import { ContractFactory } from "ethers";
import { ethers } from "hardhat";
import type {
  DepositConfigStruct,
  DepositEvent,
  OrderBook,
  WithdrawConfigStruct,
  WithdrawEvent,
} from "../../typechain/OrderBook";
import { OrderBookIntegrity } from "../../typechain/OrderBookIntegrity";
import { ReserveToken18 } from "../../typechain/ReserveToken18";
import { eighteenZeros } from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basic";
import { getEventArgs } from "../../utils/events";
import { compareStructs } from "../../utils/test/compareStructs";

describe("OrderBook withdraw from vault", async function () {
  let orderBookFactory: ContractFactory,
    tokenA: ReserveToken18,
    integrity: OrderBookIntegrity;

  beforeEach(async () => {
    tokenA = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
  });

  before(async () => {
    const integrityFactory = await ethers.getContractFactory(
      "OrderBookIntegrity"
    );
    integrity =
      (await integrityFactory.deploy()) as OrderBookIntegrity;
    await integrity.deployed();

    orderBookFactory = await ethers.getContractFactory("OrderBook", {});
  });

  it("should allow withdrawals from vaults", async function () {
    const signers = await ethers.getSigners();
    const alice = signers[1];
    const orderBook = (await orderBookFactory.deploy(
      integrity.address
    )) as OrderBook;
    const vaultId = ethers.BigNumber.from(1);

    // DEPOSITS

    const amount = ethers.BigNumber.from("1000" + eighteenZeros);
    await tokenA.transfer(alice.address, amount);

    const depositConfigStruct: DepositConfigStruct = {
      token: tokenA.address,
      vaultId,
      amount,
    };

    await tokenA
      .connect(alice)
      .approve(orderBook.address, depositConfigStruct.amount);

    // Alice deposits tokenA into her non-append-only vault
    const txDeposit = await orderBook
      .connect(alice)
      .deposit(depositConfigStruct);

    const { sender: depositSender, config: depositConfig } =
      (await getEventArgs(
        txDeposit,
        "Deposit",
        orderBook
      )) as DepositEvent["args"];

    assert(depositSender === alice.address);
    compareStructs(depositConfig, depositConfigStruct);

    const aliceTokenABalance0 = await tokenA.balanceOf(alice.address);

    const withdrawConfigStruct: WithdrawConfigStruct = {
      token: tokenA.address,
      vaultId: vaultId,
      amount,
    };

    const txWithdraw = await orderBook
      .connect(alice)
      .withdraw(withdrawConfigStruct);

    const { sender: withdrawSender, config: withdrawConfig } =
      (await getEventArgs(
        txWithdraw,
        "Withdraw",
        orderBook
      )) as WithdrawEvent["args"];

    assert(withdrawSender === alice.address);
    compareStructs(withdrawConfig, withdrawConfigStruct);

    const aliceTokenABalance1 = await tokenA.balanceOf(alice.address);

    assert(aliceTokenABalance0.isZero());
    assert(aliceTokenABalance1.eq(amount));
  });
});
