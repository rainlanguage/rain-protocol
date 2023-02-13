import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { ReadWriteTier, ReserveToken, SaleFactory } from "../../typechain";
import { EndEvent } from "../../typechain/contracts/sale/Sale";
import { zeroAddress } from "../../utils/constants/address";
import { ONE, RESERVE_ONE } from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import deploy1820 from "../../utils/deploy/registry1820/deploy";
import {
  saleDependenciesDeploy,
  saleDeploy,
} from "../../utils/deploy/sale/deploy";
import { getEventArgs } from "../../utils/events";
import { createEmptyBlock } from "../../utils/hardhat";
import {
  generateEvaluableConfig,
  memoryOperand,
  MemoryType,
  op,
} from "../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../utils/interpreter/ops/allStandardOps";
import { betweenBlockNumbersSource } from "../../utils/interpreter/sale";
import { assertError } from "../../utils/test/assertError";
import { Status } from "../../utils/types/sale";
import { Tier } from "../../utils/types/tier";

const Opcode = AllStandardOps;

describe("Sale previewCanLive (start/end sale)", async function () {
  let reserve: ReserveToken,
    readWriteTier: ReadWriteTier,
    saleFactory: SaleFactory;
  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    ({ readWriteTier, saleFactory } = await saleDependenciesDeploy());
  });

  beforeEach(async () => {
    reserve = (await basicDeploy("ReserveToken", {})) as ReserveToken;
  });

  it("should be able to end failed sale if creator does not end it", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const signer1 = signers[2];
    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleDuration = 30;
    const minimumRaise = ethers.BigNumber.from("100000").mul(RESERVE_ONE);
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
    const vBasePrice = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vStart = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );
    const vEnd = op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2));
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([op(Opcode.context, 0x0001), vBasePrice]),
      concat([]),
    ];
    const evaluableConfig = await generateEvaluableConfig(sources, constants);
    const [sale] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        evaluableConfig: evaluableConfig,
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
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );
    // wait until sale start
    await createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );
    await sale.start();
    await assertError(
      async () => await sale.connect(signer1).end(),
      "LIVE",
      "wrongly ended before configured block number"
    );
    // wait until sale can end
    await createEmptyBlock(
      saleDuration + startBlock - (await ethers.provider.getBlockNumber())
    );
    const canEnd = !(await sale.previewCanLive());
    assert(canEnd);
    const endTx = await sale.connect(signer1).end();
    const { sender: senderEnd, saleStatus: saleStatusEnd } =
      (await getEventArgs(endTx, "End", sale)) as EndEvent["args"];
    assert(senderEnd === signer1.address, "wrong End sender");
    assert(
      saleStatusEnd === Status.FAIL,
      `wrong status in event
      expected  ${Status.FAIL}
      got       ${saleStatusEnd}`
    );
    const saleStatusFail = await sale.saleStatus();
    assert(
      saleStatusFail === Status.FAIL,
      `wrong status in getter
      expected  ${Status.FAIL}
      got       ${saleStatusFail}`
    );
  });
});
