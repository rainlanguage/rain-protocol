import { assert } from "chai";
import { ContractFactory } from "ethers";
import { ethers } from "hardhat";
import type { OrderBook } from "../../typechain";
import type { ReserveToken18 } from "../../typechain";
import {
  DepositConfigStruct,
  DepositEvent,
} from "../../typechain/contracts/orderbook/OrderBook";
import { randomUint256 } from "../../utils/bytes";
import { eighteenZeros } from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import { getEventArgs } from "../../utils/events";
import { compareStructs } from "../../utils/test/compareStructs";
import { getRainContractMetaBytes } from "../../utils";
import { deployOrderBook } from "../../utils/deploy/orderBook/deploy";
import deploy1820 from "../../utils/deploy/registry1820/deploy";

describe("OrderBook vault deposit", async function () {
 
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
    await deploy1820(signers[0])  
  });

  it("should allow deposits", async function () {
    const signers = await ethers.getSigners();

    const alice = signers[1];
    const bob = signers[2];

    const orderBook = await deployOrderBook();

    const aliceOutputVault = ethers.BigNumber.from(randomUint256());
    const bobOutputVault = ethers.BigNumber.from(randomUint256());

    const amountB = ethers.BigNumber.from("1000" + eighteenZeros);
    const amountA = ethers.BigNumber.from("1000" + eighteenZeros);

    await tokenB.transfer(alice.address, amountB);
    await tokenA.transfer(bob.address, amountA);

    const depositConfigStructAlice: DepositConfigStruct = {
      token: tokenB.address,
      vaultId: aliceOutputVault,
      amount: amountB,
    };
    const depositConfigStructBob: DepositConfigStruct = {
      token: tokenA.address,
      vaultId: bobOutputVault,
      amount: amountA,
    };

    await tokenB
      .connect(alice)
      .approve(orderBook.address, depositConfigStructAlice.amount);
    await tokenA
      .connect(bob)
      .approve(orderBook.address, depositConfigStructBob.amount);

    // Alice deposits tokenB into her output vault
    const txDepositOrderAlice = await orderBook
      .connect(alice)
      .deposit(depositConfigStructAlice);
    // Bob deposits tokenA into his output vault
    const txDepositOrderBob = await orderBook
      .connect(bob)
      .deposit(depositConfigStructBob);

    const { sender: depositAliceSender, config: depositAliceConfig } =
      (await getEventArgs(
        txDepositOrderAlice,
        "Deposit",
        orderBook
      )) as DepositEvent["args"];
    const { sender: depositBobSender, config: depositBobConfig } =
      (await getEventArgs(
        txDepositOrderBob,
        "Deposit",
        orderBook
      )) as DepositEvent["args"];

    assert(depositAliceSender === alice.address);
    compareStructs(depositAliceConfig, depositConfigStructAlice);
    assert(depositBobSender === bob.address);
    compareStructs(depositBobConfig, depositConfigStructBob);
  });
});
