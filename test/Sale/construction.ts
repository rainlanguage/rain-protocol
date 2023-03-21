import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  CloneFactory,
  RainterpreterExpressionDeployer,
  ReadWriteTier,
  RedeemableERC20,
  ReserveToken,
  Sale,
} from "../../typechain";
import { DeployerDiscoverableMetaV1ConstructionConfigStruct } from "../../typechain/contracts/factory/CloneFactory";

import { SaleConstructorConfigStruct } from "../../typechain/contracts/sale/Sale";
import {
  getRainMetaDocumentFromContract,
  readWriteTierDeploy,
  redeemableERC20DeployImplementation,
  validateContractMetaAgainstABI,
} from "../../utils";
import { zeroAddress } from "../../utils/constants/address";
import { ONE, RESERVE_ONE } from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import { flowCloneFactory } from "../../utils/deploy/factory/cloneFactory";
import { getTouchDeployer } from "../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import deploy1820 from "../../utils/deploy/registry1820/deploy";
import { saleClone, saleImplementation } from "../../utils/deploy/sale/deploy";
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
  let reserve: ReserveToken;
  let readWriteTier: ReadWriteTier;

  let cloneFactory: CloneFactory;
  let implementation: Sale;
  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    readWriteTier = await readWriteTierDeploy();

    //Deploy Clone Factory
    cloneFactory = await flowCloneFactory();

    implementation = await saleImplementation(cloneFactory);
  });

  beforeEach(async () => {
    reserve = (await basicDeploy("ReserveToken", {})) as ReserveToken;
  });

  it("should prevent configuring zero minimumRaise, including case when distributionEndForwardingAddress is set", async function () {
    const signers = await ethers.getSigners();
    const [deployer, recipient, distributionEndForwardingAddress] = signers;

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
      concat([op(Opcode.context, 0x0000), vBasePrice]),
      concat([]),
    ];
    const evaluableConfig = await generateEvaluableConfig(sources, constants);
    await assertError(
      async () =>
        await await saleClone(
          signers,
          deployer,
          cloneFactory,
          implementation,
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
    const [deployer, recipient, distributor] = signers;

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
      concat([op(Opcode.context, 0x0000), vBasePrice]),
      concat([]),
    ];
    const evaluableConfig = await generateEvaluableConfig(sources, constants);
    await assertError(
      async () =>
        await await saleClone(
          signers,
          deployer,
          cloneFactory,
          implementation,
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

  it("should fail if sale is deployed with bad callerMeta", async function () {
    const saleFactory = await ethers.getContractFactory("Sale", {});

    const touchDeployer: RainterpreterExpressionDeployer =
      await getTouchDeployer();

    const redeemableERC20Implementation: RedeemableERC20 =
      await redeemableERC20DeployImplementation();

    const deployerDiscoverableMetaConfig0: DeployerDiscoverableMetaV1ConstructionConfigStruct =
      {
        meta: getRainMetaDocumentFromContract("sale"),
        deployer: touchDeployer.address,
      };

    const saleConstructorConfig0: SaleConstructorConfigStruct = {
      maximumSaleTimeout: 1000,
      cloneFactory: cloneFactory.address,
      redeemableERC20Implementation: redeemableERC20Implementation.address,
      deployerDiscoverableMetaConfig: deployerDiscoverableMetaConfig0,
    };

    const sale = (await saleFactory.deploy(saleConstructorConfig0)) as Sale;

    assert(!(sale.address === zeroAddress), "sale did not deploy");

    const deployerDiscoverableMetaConfig1: DeployerDiscoverableMetaV1ConstructionConfigStruct =
      {
        meta: getRainMetaDocumentFromContract("orderbook"),
        deployer: touchDeployer.address,
      };

    const saleConstructorConfig1: SaleConstructorConfigStruct = {
      maximumSaleTimeout: 1000,
      cloneFactory: cloneFactory.address,
      redeemableERC20Implementation: redeemableERC20Implementation.address,
      deployerDiscoverableMetaConfig: deployerDiscoverableMetaConfig1,
    };
    await assertError(
      async () => await saleFactory.deploy(saleConstructorConfig1),
      "UnexpectedMetaHash",
      "Sale Deployed for bad hash"
    );
  });

  it("should validate contract meta with abi", async function () {
    assert(
      validateContractMetaAgainstABI("sale"),
      "Contract Meta Inconsistent with Contract ABI"
    );
  });
});
