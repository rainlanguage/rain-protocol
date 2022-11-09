import { ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { OrderBookFlashLender } from "../../../typechain/contracts/orderbook/OrderBookFlashLender";
import { ReserveToken18 } from "../../../typechain/contracts/test/testToken/ReserveToken18";
import {
  ERC3156FlashBorrowerTest,
  IERC3156FlashBorrower,
} from "../../../typechain";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import { eighteenZeros } from "../../../utils/constants/bigNumber";
import { assert } from "chai";
import { FakeContract, smock } from "@defi-wonderland/smock";
import { keccak256 } from "ethers/lib/utils";
import { assertError } from "../../../utils/test/assertError";
import { randomAddress } from "../../../utils/bytes";

const CALLBACK_SUCCESS = keccak256([
  ...Buffer.from("ERC3156FlashBorrower.onFlashLoan"),
]);
const CALLBACK_FOO = keccak256([...Buffer.from("foo")]);

describe("OrderBookFlashLender flashLoan test", async function () {
  let orderBookFlashLenderFactory: ContractFactory;
  let erc3156FlashBorrower: ERC3156FlashBorrowerTest;
  let fakeIERC3156FlashBorrower: FakeContract<IERC3156FlashBorrower>;
  let tokenA: ReserveToken18;
  let tokenB: ReserveToken18;
  let lender: OrderBookFlashLender;

  beforeEach(async () => {
    erc3156FlashBorrower = (await basicDeploy(
      "ERC3156FlashBorrowerTest",
      {}
    )) as ERC3156FlashBorrowerTest;
    fakeIERC3156FlashBorrower = await smock.fake("IERC3156FlashBorrower");
    tokenA = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    tokenB = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await tokenA.initialize();
    await tokenB.initialize();
    lender =
      (await orderBookFlashLenderFactory.deploy()) as OrderBookFlashLender;
  });

  before(async () => {
    orderBookFlashLenderFactory = await ethers.getContractFactory(
      "OrderBookFlashLender",
      {}
    );
  });

  it("should return maxFlashLoan equal to this contract's current token balance", async function () {
    // deposit amount for lending
    const amount = ethers.BigNumber.from(123 + eighteenZeros);
    await tokenA.transfer(lender.address, amount);
    assert((await tokenA.balanceOf(lender.address)).eq(amount));

    const maxFlashLoan_ = await lender.maxFlashLoan(tokenA.address);

    assert(
      maxFlashLoan_.eq(amount),
      "did not report total token balance on lender contract as the maxFlashLoan amount"
    );
  });

  it("should return flashFee of 0 always", async function () {
    const fee = await lender.flashFee(randomAddress(), 0);
    assert(fee.isZero());
  });

  it("should perform a flash loan with zero fee on the good path", async function () {
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

  it("should roll back flash loan transaction if callback does not return a hash", async function () {
    // deposit amount for lending
    const amount = ethers.BigNumber.from(123 + eighteenZeros);
    await tokenA.transfer(lender.address, amount);
    assert((await tokenA.balanceOf(lender.address)).eq(amount));

    await assertError(
      async () =>
        await lender.flashLoan(
          fakeIERC3156FlashBorrower.address,
          tokenA.address,
          amount,
          []
        ),
      "FlashLender: Callback failed",
      "did not roll back transaction"
    );
  });

  it("should roll back flash loan transaction if callback does not return correct hash", async function () {
    fakeIERC3156FlashBorrower.onFlashLoan.returns(CALLBACK_FOO);

    // deposit amount for lending
    const amount = ethers.BigNumber.from(123 + eighteenZeros);
    await tokenA.transfer(lender.address, amount);
    assert((await tokenA.balanceOf(lender.address)).eq(amount));

    await assertError(
      async () =>
        await lender.flashLoan(
          fakeIERC3156FlashBorrower.address,
          tokenA.address,
          amount,
          []
        ),
      "FlashLender: Callback failed",
      "did not roll back transaction"
    );
  });

  it("should roll back flash loan transaction if debt finalization isn't approved", async function () {
    fakeIERC3156FlashBorrower.onFlashLoan.returns(CALLBACK_SUCCESS);

    // deposit amount for lending
    const amount = ethers.BigNumber.from(123 + eighteenZeros);
    await tokenA.transfer(lender.address, amount);
    assert((await tokenA.balanceOf(lender.address)).eq(amount));

    await assertError(
      async () =>
        await lender.flashLoan(
          fakeIERC3156FlashBorrower.address,
          tokenA.address,
          amount,
          []
        ),
      "ERC20: insufficient allowance",
      "did not roll back transaction"
    );
  });
});
