import { assert } from "chai";

import { ethers } from "hardhat";
import type { ReserveToken18 } from "../../typechain";
import { DepositConfigStruct } from "../../typechain/contracts/orderbook/OrderBook";
import { randomUint256 } from "../../utils/bytes";
import { eighteenZeros } from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import { deployOrderBook } from "../../utils/deploy/orderBook/deploy";
import deploy1820 from "../../utils/deploy/registry1820/deploy";

describe("OrderBook vaultBalance", async function () {
  let tokenA: ReserveToken18;
  let tokenB: ReserveToken18;

  beforeEach(async () => {
    tokenA = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    tokenB = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await tokenA.initialize();
    await tokenB.initialize();
  });

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);
  });

  it("should record vault balance and allow reading balance via getter", async function () {
    const signers = await ethers.getSigners();

    const [, alice] = signers;

    const orderBook = await deployOrderBook();

    const aliceInputVault = ethers.BigNumber.from(randomUint256());
    const aliceOutputVault = ethers.BigNumber.from(randomUint256());

    const amountA = ethers.BigNumber.from("1000" + eighteenZeros);
    const amountB = ethers.BigNumber.from("500" + eighteenZeros);

    await tokenA.transfer(alice.address, amountA);
    await tokenB.transfer(alice.address, amountB);

    const depositConfigStructAliceA: DepositConfigStruct = {
      token: tokenA.address,
      vaultId: aliceOutputVault,
      amount: amountA,
    };
    const depositConfigStructAliceB: DepositConfigStruct = {
      token: tokenB.address,
      vaultId: aliceOutputVault,
      amount: amountB,
    };

    await tokenA
      .connect(alice)
      .approve(orderBook.address, depositConfigStructAliceA.amount);
    await tokenB
      .connect(alice)
      .approve(orderBook.address, depositConfigStructAliceB.amount);

    // Alice deposits tokenA into her output vault
    await orderBook.connect(alice).deposit(depositConfigStructAliceA);
    await orderBook.connect(alice).deposit(depositConfigStructAliceB);

    const _vaultBalanceInputA = await orderBook.vaultBalance(
      alice.address,
      tokenA.address,
      aliceInputVault
    );
    const _vaultBalanceInputB = await orderBook.vaultBalance(
      alice.address,
      tokenB.address,
      aliceInputVault
    );

    const _vaultBalanceOutputA = await orderBook.vaultBalance(
      alice.address,
      tokenA.address,
      aliceOutputVault
    );
    const _vaultBalanceOutputB = await orderBook.vaultBalance(
      alice.address,
      tokenB.address,
      aliceOutputVault
    );

    assert(_vaultBalanceInputA.isZero());
    assert(_vaultBalanceInputB.isZero());
    assert(_vaultBalanceOutputA.eq(amountA));
    assert(_vaultBalanceOutputB.eq(amountB));
  });
});
