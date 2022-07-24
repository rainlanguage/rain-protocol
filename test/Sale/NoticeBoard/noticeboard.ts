import { assert } from "chai";
import { concat, hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { NoticeBoard } from "../../../typechain/NoticeBoard";
import { ReadWriteTier } from "../../../typechain/ReadWriteTier";
import { ReserveToken } from "../../../typechain/ReserveToken";
import { SaleFactory } from "../../../typechain/SaleFactory";
import { zeroAddress } from "../../../utils/constants/address";
import { ONE, RESERVE_ONE } from "../../../utils/constants/bigNumber";
import { basicDeploy } from "../../../utils/deploy/basic";
import { saleDependenciesDeploy, saleDeploy } from "../../../utils/deploy/sale";
import { getEventArgs } from "../../../utils/events";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { betweenBlockNumbersSource } from "../../../utils/rainvm/sale";
import { op, memoryOperand, MemoryType } from "../../../utils/rainvm/vm";
import { Tier } from "../../../utils/types/tier";

const Opcode = AllStandardOps;

describe("Sale noticeboard", async function () {
  let reserve: ReserveToken,
    readWriteTier: ReadWriteTier,
    saleFactory: SaleFactory;

  before(async () => {
    ({ readWriteTier, saleFactory } = await saleDependenciesDeploy());
  });

  beforeEach(async () => {
    reserve = (await basicDeploy("ReserveToken", {})) as ReserveToken;
  });

  it("should allow anon to add to NoticeBoard and associate a NewNotice with this sale", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const signer1 = signers[2];
    const forwardingAddress = signers[4];
    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleDuration = 30;
    const minimumRaise = ethers.BigNumber.from("150000").mul(RESERVE_ONE);
    const totalTokenSupply = ethers.BigNumber.from("2000").mul(ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: zeroAddress,
      initialSupply: totalTokenSupply,
    };
    const staticPrice = ethers.BigNumber.from("75").mul(RESERVE_ONE);
    const constants = [
      staticPrice,
      startBlock - 1,
      startBlock + saleDuration - 1,
    ];
    const vBasePrice = op(Opcode.MEMORY, memoryOperand(MemoryType.Constant, 0));
    const vStart = op(Opcode.MEMORY, memoryOperand(MemoryType.Constant, 1));
    const vEnd = op(Opcode.MEMORY, memoryOperand(MemoryType.Constant, 2));
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([op(Opcode.MEMORY, memoryOperand(MemoryType.Context, 0)), vBasePrice]),
    ];
    const [sale] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        vmStateConfig: {
          sources,
          constants,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration: 1,
        minimumRaise,
        dustSize: 0,
        saleTimeout: 100,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: forwardingAddress.address,
      }
    );
    const noticeboardFactory = await ethers.getContractFactory("NoticeBoard");
    const noticeboard = (await noticeboardFactory.deploy()) as NoticeBoard;
    const message = "foo";
    const notice = {
      subject: sale.address,
      data: hexlify([...Buffer.from(message)]),
    };
    const event0 = await getEventArgs(
      await noticeboard.connect(signer1).createNotices([notice]),
      "NewNotice",
      noticeboard
    );
    assert(event0.sender === signer1.address, "wrong sender in event0");
    assert(
      JSON.stringify(event0.notice) === JSON.stringify(Object.values(notice)),
      "wrong notice in event0"
    );
  });
});
