import { assert } from "chai";
import { Contract, ContractFactory } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  OrderBook,
  OrderConfigStruct,
  OrderDeadEvent,
  OrderLiveEvent,
} from "../../typechain/OrderBook";
import { OrderBookStateBuilder } from "../../typechain/OrderBookStateBuilder";
import { ReserveToken18 } from "../../typechain/ReserveToken18";
import { eighteenZeros, max_uint256 } from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basic";
import { getEventArgs } from "../../utils/events";
import { OrderBookOpcode } from "../../utils/rainvm/ops/orderBookOps";
import { op } from "../../utils/rainvm/vm";
import { compareStructs } from "../../utils/test/compareStructs";

const Opcode = OrderBookOpcode;

describe("OrderBook remove order", async function () {
  let orderBookFactory: ContractFactory,
    tokenA: ReserveToken18 & Contract,
    tokenB: ReserveToken18 & Contract,
    stateBuilder: OrderBookStateBuilder & Contract;

  beforeEach(async () => {
    tokenA = (await basicDeploy("ReserveToken18", {})) as ReserveToken18 &
      Contract;
    tokenB = (await basicDeploy("ReserveToken18", {})) as ReserveToken18 &
      Contract;
  });

  before(async () => {
    const stateBuilderFactory = await ethers.getContractFactory(
      "OrderBookStateBuilder"
    );
    stateBuilder =
      (await stateBuilderFactory.deploy()) as OrderBookStateBuilder & Contract;
    await stateBuilder.deployed();

    orderBookFactory = await ethers.getContractFactory("OrderBook", {});
  });

  it("should support removing orders", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alice = signers[1];

    const orderBook = (await orderBookFactory.deploy(
      stateBuilder.address
    )) as OrderBook & Contract;

    const aliceInputVault = ethers.BigNumber.from(1);
    const aliceOutputVault = ethers.BigNumber.from(2);

    const askPrice = ethers.BigNumber.from("90" + eighteenZeros);
    const askConstants = [max_uint256, askPrice];
    const vAskOutputMax = op(Opcode.CONSTANT, 0);
    const vAskPrice = op(Opcode.CONSTANT, 1);
    // prettier-ignore
    const askSource = concat([
      vAskOutputMax,
      vAskPrice,
    ]);
    const askOrderConfig: OrderConfigStruct = {
      inputToken: tokenA.address,
      inputVaultId: aliceInputVault,
      outputToken: tokenB.address,
      outputVaultId: aliceOutputVault,
      tracking: 0x0,
      vmStateConfig: {
        sources: [askSource],
        constants: askConstants,
      },
    };

    const txAskOrderLive = await orderBook
      .connect(alice)
      .addOrder(askOrderConfig);

    const { sender: askLiveSender, config: askLiveConfig } =
      (await getEventArgs(
        txAskOrderLive,
        "OrderLive",
        orderBook
      )) as OrderLiveEvent["args"];

    assert(askLiveSender === alice.address, "wrong sender");
    compareStructs(askLiveConfig, askOrderConfig);

    // REMOVE ASK ORDER

    const txAskOrderDead = await orderBook
      .connect(alice)
      .removeOrder(askLiveConfig);

    const { sender: askDeadSender, config: askDeadConfig } =
      (await getEventArgs(
        txAskOrderDead,
        "OrderDead",
        orderBook
      )) as OrderDeadEvent["args"];

    assert(askDeadSender === alice.address, "wrong sender");
    compareStructs(askDeadConfig, askOrderConfig);
  });
});
