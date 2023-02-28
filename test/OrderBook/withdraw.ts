import { assert } from "chai";

import { ethers } from "hardhat";
import type { ReserveToken18 } from "../../typechain";
import {
  DepositConfigStruct,
  DepositEvent,
  WithdrawConfigStruct,
  WithdrawEvent,
} from "../../typechain/contracts/orderbook/OrderBook";

import { eighteenZeros } from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import { deployOrderBook } from "../../utils/deploy/orderBook/deploy";
import deploy1820 from "../../utils/deploy/registry1820/deploy";

import { getEventArgs } from "../../utils/events";
import { compareStructs } from "../../utils/test/compareStructs";

describe("OrderBook withdraw from vault", async function () {
  let tokenA: ReserveToken18;

  beforeEach(async () => {
    tokenA = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await tokenA.initialize();
  });

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);
  });

  it("should allow withdrawals from vaults", async function () {
    const signers = await ethers.getSigners();
    const [, alice] = signers;

    const orderBook = await deployOrderBook();
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
