import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { ReadWriteTier, ReserveToken, SaleFactory } from "../../typechain";
import { zeroAddress } from "../../utils/constants/address";
import { ONE, RESERVE_ONE } from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import deploy1820 from "../../utils/deploy/registry1820/deploy";
import {
  saleDependenciesDeploy,
  saleDeploy,
} from "../../utils/deploy/sale/deploy";
import {
  generateEvaluableConfig,
  memoryOperand,
  MemoryType,
  op,
} from "../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../utils/interpreter/ops/allStandardOps";
import { betweenBlockNumbersSource } from "../../utils/interpreter/sale";
import { assertError } from "../../utils/test/assertError";
import { Tier } from "../../utils/types/tier";

const Opcode = AllStandardOps;

describe("Sale construction", async function () {
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

  it("should prevent configuring zero minimumRaise, including case when distributionEndForwardingAddress is set", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const distributionEndForwardingAddress = signers[2];
    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleDuration = 30;
    const minimumRaise = 0;
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
      Opcode.readMemory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vStart = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));
    const vEnd = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 2));
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([op(Opcode.context, 0x0000), vBasePrice]),
      concat([]),
    ];
    const evaluableConfig = await generateEvaluableConfig(
      sources,
      constants,
    );
    await assertError(
      async () =>
        await saleDeploy(
          signers,
          deployer,
          saleFactory,
          {
            evaluableConfig,
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
            distributionEndForwardingAddress:
              distributionEndForwardingAddress.address,
          }
        ),
      "MIN_RAISE_0",
      "wrongly initialized sale with minimumRaise set to 0"
    );
  });

  it("should fail to initialize when deployer attempts to set a distributor", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const distributor = signers[2];
    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleDuration = 30;
    const minimumRaise = ethers.BigNumber.from("150000").mul(RESERVE_ONE);
    const totalTokenSupply = ethers.BigNumber.from("2000").mul(ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: distributor.address,
      initialSupply: totalTokenSupply,
    };
    const staticPrice = ethers.BigNumber.from("75").mul(RESERVE_ONE);
    const constants = [
      staticPrice,
      startBlock - 1,
      startBlock + saleDuration - 1,
    ];
    const vBasePrice = op(
      Opcode.readMemory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vStart = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));
    const vEnd = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 2));
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([op(Opcode.context, 0x0000), vBasePrice]),
      concat([]),
    ];
    const evaluableConfig = await generateEvaluableConfig(
      sources,
      constants,
    );
    await assertError(
      async () =>
        await saleDeploy(
          signers,
          deployer,
          saleFactory,
          {
            evaluableConfig,
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
        ),
      "DISTRIBUTOR_SET",
      "did not alert deployer about setting custom distributor, since Sale will override this to automatically set the distributor to itself"
    );
  });
});
