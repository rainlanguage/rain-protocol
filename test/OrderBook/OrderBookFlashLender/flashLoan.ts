import { ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { OrderBookFlashLender } from "../../../typechain/contracts/orderbook/OrderBookFlashLender";
import { ReserveToken18 } from "../../../typechain/contracts/test/testToken/ReserveToken18";
import { ERC3156FlashBorrowerTest } from "../../../typechain";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import { eighteenZeros } from "../../../utils/constants/bigNumber";
import { assert } from "chai";

describe("OrderBookFlashLender flashLoan test", async function () {
  let orderBookFlashLenderFactory: ContractFactory;
  let erc3156FlashBorrower: ERC3156FlashBorrowerTest;
  let tokenA: ReserveToken18;
  let tokenB: ReserveToken18;

  beforeEach(async () => {
    erc3156FlashBorrower = (await basicDeploy(
      "ERC3156FlashBorrowerTest",
      {}
    )) as ERC3156FlashBorrowerTest;
    tokenA = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    tokenB = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await tokenA.initialize();
    await tokenB.initialize();
  });

  before(async () => {
    orderBookFlashLenderFactory = await ethers.getContractFactory(
      "OrderBookFlashLender",
      {}
    );
  });

  it("should perform a flash loan on the good path", async function () {
    const lender =
      (await orderBookFlashLenderFactory.deploy()) as OrderBookFlashLender;

    // deposit amount for lending
    const amount = ethers.BigNumber.from(123 + eighteenZeros);
    await tokenA.transfer(lender.address, amount);
    assert((await tokenA.balanceOf(lender.address)).eq(amount));

    await lender.flashLoan(
      erc3156FlashBorrower.address,
      tokenA.address,
      amount,
      []
    );
  });
});
