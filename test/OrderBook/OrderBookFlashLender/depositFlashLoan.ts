// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//// @ts-nocheck

import { assert } from "chai";
import { ContractFactory } from "ethers";
import { ethers } from "hardhat";
import type {
  ERC3156FlashBorrowerDepositTest,
  OrderBook,
  ReserveToken18,
} from "../../../typechain";
import { DepositConfigStruct } from "../../../typechain/contracts/orderbook/OrderBook";
import { randomUint256 } from "../../../utils/bytes";
import { eighteenZeros } from "../../../utils/constants/bigNumber";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";

describe("OrderBook flash loan deposit tests", async function () {
  let orderBookFactory: ContractFactory;
  let USDT: ReserveToken18;
  let DAI: ReserveToken18;
  let erc3156Bot: ERC3156FlashBorrowerDepositTest;

  beforeEach(async () => {
    USDT = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    DAI = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await USDT.initialize();
    await DAI.initialize();

    erc3156Bot = (await basicDeploy(
      "ERC3156FlashBorrowerDepositTest",
      {}
    )) as ERC3156FlashBorrowerDepositTest;
  });

  before(async () => {
    orderBookFactory = await ethers.getContractFactory("OrderBook", {});
  });

  it("should not allow depositing flash loan without paying it back", async function () {
    const orderBook = (await orderBookFactory.deploy()) as OrderBook;

    const vaultBot = ethers.BigNumber.from(randomUint256());

    const amountCanLoan = ethers.BigNumber.from("20" + eighteenZeros);

    await DAI.transfer(orderBook.address, amountCanLoan);

    // bot deposits flash loan
    const depositConfigStruct: DepositConfigStruct = {
      token: DAI.address,
      vaultId: vaultBot,
      amount: amountCanLoan,
    };
    await orderBook.flashLoan(
      erc3156Bot.address,
      DAI.address,
      amountCanLoan,
      ethers.utils.defaultAbiCoder.encode(
        [
          {
            type: "tuple",
            name: "depositConfig",
            components: [
              { name: "token", type: "address" },
              { name: "vaultId", type: "uint256" },
              { name: "amount", type: "uint256" },
            ],
          },
        ],
        [depositConfigStruct]
      )
    );
  });
});
