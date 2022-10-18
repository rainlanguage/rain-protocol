import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { ReadWriteTier } from "../../typechain";
import { ReserveToken } from "../../typechain";
import { SaleFactory } from "../../typechain";
import { zeroAddress } from "../../utils/constants/address";
import { ONE, RESERVE_ONE } from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basic";
import { saleDependenciesDeploy, saleDeploy } from "../../utils/deploy/sale";
import { AllStandardOps } from "../../utils/interpreter/ops/allStandardOps";
import { betweenBlockNumbersSource } from "../../utils/interpreter/sale";
import {
  op,
  memoryOperand,
  MemoryType,
} from "../../utils/interpreter/interpreter";
import { assertError } from "../../utils/test/assertError";
import { Tier } from "../../utils/types/tier";

const Opcode = AllStandardOps;

describe("Sale construction", async function () {
  let reserve: ReserveToken,
    readWriteTier: ReadWriteTier,
    saleFactory: SaleFactory;

  before(async () => {
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
    const vBasePrice = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vStart = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const vEnd = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([op(Opcode.CONTEXT), vBasePrice]),
    ];
    await assertError(
      async () =>
        await saleDeploy(
          signers,
          deployer,
          saleFactory,
          {
            interpreterStateConfig: {
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
    const vBasePrice = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vStart = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const vEnd = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([op(Opcode.CONTEXT), vBasePrice]),
    ];
    await assertError(
      async () =>
        await saleDeploy(
          signers,
          deployer,
          saleFactory,
          {
            interpreterStateConfig: {
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
            distributionEndForwardingAddress: ethers.constants.AddressZero,
          }
        ),
      "DISTRIBUTOR_SET",
      "did not alert deployer about setting custom distributor, since Sale will override this to automatically set the distributor to itself"
    );
  });
});
