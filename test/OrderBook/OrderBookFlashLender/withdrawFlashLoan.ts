// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

import { assert } from "chai";
import { ContractFactory } from "ethers";
import { ethers } from "hardhat";
import type {
  ERC3156FlashBorrowerWithdrawTest,
  OrderBook,
  ReserveToken18,
} from "../../../typechain";
import {
  DepositConfigStruct,
  WithdrawConfigStruct,
} from "../../../typechain/contracts/orderbook/OrderBook";
import { randomUint256 } from "../../../utils/bytes";
import { eighteenZeros } from "../../../utils/constants/bigNumber";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import { getRainContractMetaBytes } from "../../../utils";

describe("OrderBook flash loan withdraw tests", async function () {
  let orderBookFactory: ContractFactory;
  let USDT: ReserveToken18;
  let DAI: ReserveToken18;
  let erc3156Bot: ERC3156FlashBorrowerWithdrawTest;

  beforeEach(async () => {
    USDT = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    DAI = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await USDT.initialize();
    await DAI.initialize();

    erc3156Bot = (await basicDeploy(
      "ERC3156FlashBorrowerWithdrawTest",
      {}
    )) as ERC3156FlashBorrowerWithdrawTest;
  });

  before(async () => {
    orderBookFactory = await ethers.getContractFactory("OrderBook", {});
  });

  it("should not allow decreasing flash debt by more than the sender's vault balance", async function () {
    const orderBook = (await orderBookFactory.deploy(
      getRainContractMetaBytes("orderbook")
    )) as OrderBook;

    const vaultBot = ethers.BigNumber.from(randomUint256());

    const amountCanLoan = ethers.BigNumber.from("20" + eighteenZeros);
    const amountBotDAI = ethers.BigNumber.from("10" + eighteenZeros);

    await DAI.transfer(orderBook.address, amountCanLoan);

    // bot deposits a smaller amount
    await DAI.transfer(erc3156Bot.address, amountBotDAI);
    const depositConfigStructBot: DepositConfigStruct = {
      token: DAI.address,
      vaultId: vaultBot,
      amount: amountBotDAI,
    };
    await erc3156Bot.orderBookDeposit(
      orderBook.address,
      depositConfigStructBot
    );

    // note vault balance
    const botVaultBalance0 = await orderBook.vaultBalance(
      erc3156Bot.address,
      DAI.address,
      vaultBot
    );
    assert(botVaultBalance0.eq(amountBotDAI));

    // bot gets flash loan from orderbook and attempts to decrease debt via `.withdraw()`
    // note that bot has a lower vault balance than alice
    const withdrawConfigStruct: WithdrawConfigStruct = {
      token: DAI.address,
      vaultId: vaultBot,
      amount: amountCanLoan, // much more than bot's current vault balance
    };
    await orderBook.flashLoan(
      erc3156Bot.address,
      DAI.address,
      amountCanLoan, // much more than bot's current vault balance
      ethers.utils.defaultAbiCoder.encode(
        [
          {
            type: "tuple",
            name: "withdrawConfig",
            components: [
              { name: "token", type: "address" },
              { name: "vaultId", type: "uint256" },
              { name: "amount", type: "uint256" },
            ],
          },
        ],
        [withdrawConfigStruct]
      )
    );

    const botVaultBalance1 = await orderBook.vaultBalance(
      erc3156Bot.address,
      DAI.address,
      vaultBot
    );
    const botBalance1 = await DAI.balanceOf(erc3156Bot.address);

    assert(botVaultBalance1.isZero());
    assert(botBalance1.eq(amountBotDAI)); // bot only gets out what what deposited and paid back the loan in full
  });
});
