import * as Util from "../Util";
import chai from "chai";
import { ethers } from "hardhat";
import { Contract, ContractFactory } from "ethers";
import type { ClaimEvent, OrderBook } from "../../typechain/OrderBook";
import { ReserveToken } from "../../typechain/ReserveToken";

const { assert } = chai;

let orderBookFactory: ContractFactory, token: ReserveToken & Contract;

describe("OrderBook", async function () {
  beforeEach(async () => {
    token = (await Util.basicDeploy("ReserveToken", {})) as ReserveToken &
      Contract;
  });

  before(async () => {
    orderBookFactory = await ethers.getContractFactory("OrderBook", {});
  });

  it("should process a claim", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const alice = signers[1];

    const orderBook = (await orderBookFactory.deploy()) as OrderBook & Contract;

    const txClaim = await orderBook.connect(alice).claim(token.address);

    const { sender, amount } = (await Util.getEventArgs(
      txClaim,
      "Claim",
      orderBook
    )) as ClaimEvent["args"];

    assert(sender === alice.address, "wrong sender");
    assert(amount.isZero(), "wrong claim amount");
  });
});
