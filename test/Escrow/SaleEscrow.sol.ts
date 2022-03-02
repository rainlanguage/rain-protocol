import * as Util from "../Util";
import chai from "chai";
import { artifacts, ethers } from "hardhat";
import { getEventArgs, op } from "../Util";
import {
  afterBlockNumberConfig,
  Opcode,
  saleDeploy,
  Tier,
} from "../Sale/SaleUtil";
import { concat } from "ethers/lib/utils";
import { ReserveToken } from "../../typechain/ReserveToken";
import { Contract, ContractFactory } from "ethers";
import { RedeemableERC20Factory } from "../../typechain/RedeemableERC20Factory";
import { ReadWriteTier } from "../../typechain/ReadWriteTier";
import {
  SaleConfigStruct,
  SaleConstructorConfigStruct,
  SaleRedeemableERC20ConfigStruct,
} from "../../typechain/Sale";
import { SaleEscrowWrapper } from "../../typechain/SaleEscrowWrapper";
import { SaleMutableAddressesTest } from "../../typechain/SaleMutableAddressesTest";
import { SaleMutableAddressesTestFactory } from "../../typechain/SaleMutableAddressesTestFactory";
import { RedeemableERC20 } from "../../typechain/RedeemableERC20";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

const { assert } = chai;

enum EscrowStatus {
  /// The underlying `Sale` has not reached a definitive pass/fail state.
  /// Important this is the first item in the enum as inequality is used to
  /// check pending vs. pass/fail in security sensitive code.
  Pending,
  /// The underlying `Sale` distribution failed.
  Fail,
  /// The underlying `Sale` distribution succeeded.
  Success,
}

enum SaleStatus {
  Pending,
  Active,
  Success,
  Fail,
}

let reserve: ReserveToken & Contract,
  redeemableERC20FactoryFactory: ContractFactory,
  redeemableERC20Factory: RedeemableERC20Factory & Contract,
  readWriteTierFactory: ContractFactory,
  readWriteTier: ReadWriteTier & Contract,
  saleConstructorConfig: SaleConstructorConfigStruct,
  saleFactoryFactory: ContractFactory,
  saleFactory: SaleMutableAddressesTestFactory & Contract;

const saleMutableAddressesTestDeploy = async (
  signers: SignerWithAddress[],
  deployer: SignerWithAddress,
  saleTestFactory: SaleMutableAddressesTestFactory & Contract,
  config: SaleConfigStruct,
  saleRedeemableERC20Config: SaleRedeemableERC20ConfigStruct,
  ...args
): Promise<
  [SaleMutableAddressesTest & Contract, RedeemableERC20 & Contract]
> => {
  const txDeploy = await saleTestFactory.createChildTyped(
    config,
    saleRedeemableERC20Config,
    ...args
  );

  const saleMutableAddressesTest = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(txDeploy, "NewChild", saleTestFactory)).child
      ),
      20 // address bytes length
    ),
    (await artifacts.readArtifact("SaleMutableAddressesTest")).abi,
    deployer
  ) as SaleMutableAddressesTest & Contract;

  if (!ethers.utils.isAddress(saleMutableAddressesTest.address)) {
    throw new Error(
      `invalid sale address: ${saleMutableAddressesTest.address} (${saleMutableAddressesTest.address.length} chars)`
    );
  }

  await saleMutableAddressesTest.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  saleMutableAddressesTest.deployTransaction = txDeploy;

  let token = new ethers.Contract(
    await saleMutableAddressesTest.token(),
    (await artifacts.readArtifact("RedeemableERC20")).abi
  ) as RedeemableERC20 & Contract;

  token = token.connect(signers[0]); // need to do this for some reason

  return [saleMutableAddressesTest, token];
};

describe("SaleEscrow", async function () {
  beforeEach(async () => {
    reserve = (await Util.basicDeploy("ReserveToken", {})) as ReserveToken &
      Contract;
  });

  before(async () => {
    redeemableERC20FactoryFactory = await ethers.getContractFactory(
      "RedeemableERC20Factory",
      {}
    );
    redeemableERC20Factory =
      (await redeemableERC20FactoryFactory.deploy()) as RedeemableERC20Factory &
        Contract;
    await redeemableERC20Factory.deployed();

    readWriteTierFactory = await ethers.getContractFactory("ReadWriteTier");
    readWriteTier = (await readWriteTierFactory.deploy()) as ReadWriteTier &
      Contract;
    await readWriteTier.deployed();

    saleConstructorConfig = {
      maximumCooldownDuration: 1000,
      redeemableERC20Factory: redeemableERC20Factory.address,
    };

    saleFactoryFactory = await ethers.getContractFactory("SaleFactory", {});
    saleFactory = (await saleFactoryFactory.deploy(
      saleConstructorConfig
    )) as SaleMutableAddressesTestFactory & Contract;
    await saleFactory.deployed();
  });

  it("should prevent 'malicious' sale contract from modifying reserve and token addresses", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];

    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleTimeout = 30;
    const minimumRaise = ethers.BigNumber.from("150000").mul(Util.RESERVE_ONE);

    const totalTokenSupply = ethers.BigNumber.from("2000").mul(Util.ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };

    const staticPrice = ethers.BigNumber.from("75").mul(Util.RESERVE_ONE);

    const constants = [staticPrice];
    const vBasePrice = op(Opcode.VAL, 0);

    const sources = [concat([vBasePrice])];

    const saleMutableAddressesTestFactoryFactory =
      await ethers.getContractFactory("SaleMutableAddressesTestFactory", {});
    const saleMutableAddressesTestFactory =
      (await saleMutableAddressesTestFactoryFactory.deploy(
        saleConstructorConfig
      )) as SaleMutableAddressesTestFactory & Contract;
    await saleMutableAddressesTestFactory.deployed();

    const [saleMutableAddressesTest] = await saleMutableAddressesTestDeploy(
      signers,
      deployer,
      saleMutableAddressesTestFactory,
      {
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
        calculatePriceStateConfig: {
          sources,
          constants,
          stackLength: 1,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration: 1,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );

    const saleEscrowWrapper = (await Util.basicDeploy(
      "SaleEscrowWrapper",
      {}
    )) as SaleEscrowWrapper & Contract;

    // sale escrow indexes reserve and token addresses, and escrow status
    await saleEscrowWrapper.fetchReserve(saleMutableAddressesTest.address);
    await saleEscrowWrapper.fetchToken(saleMutableAddressesTest.address);
    await saleEscrowWrapper.fetchEscrowStatus(saleMutableAddressesTest.address);

    const saleEscrowReserve0 = await saleEscrowWrapper.getReserve(
      saleMutableAddressesTest.address
    );
    const saleEscrowToken0 = await saleEscrowWrapper.getToken(
      saleMutableAddressesTest.address
    );

    const newReserve = ethers.Wallet.createRandom();
    const newToken = ethers.Wallet.createRandom();

    await saleMutableAddressesTest.updateReserve(newReserve.address);
    await saleMutableAddressesTest.updateToken(newToken.address);

    await saleEscrowWrapper.fetchReserve(saleMutableAddressesTest.address);
    await saleEscrowWrapper.fetchToken(saleMutableAddressesTest.address);

    const saleEscrowReserve1 = await saleEscrowWrapper.getReserve(
      saleMutableAddressesTest.address
    );
    const saleEscrowToken1 = await saleEscrowWrapper.getToken(
      saleMutableAddressesTest.address
    );

    // sanity check
    assert(
      saleEscrowReserve0 !== newReserve.address,
      "for some miraculous reason the new reserve has same address as original reserve"
    );
    assert(
      saleEscrowReserve0 === saleEscrowReserve1,
      "sale escrow wrongly updated reserve address"
    );

    // sanity check
    assert(
      saleEscrowToken0 !== newToken.address,
      "for some miraculous reason the new token has same address as original token"
    );
    assert(
      saleEscrowToken0 === saleEscrowToken1,
      "sale escrow wrongly updated token address"
    );
  });

  it("should return reserve and token addresses, and escrow status of Pending, after Sale initialisation", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];

    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleTimeout = 30;
    const minimumRaise = ethers.BigNumber.from("150000").mul(Util.RESERVE_ONE);

    const totalTokenSupply = ethers.BigNumber.from("2000").mul(Util.ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };

    const staticPrice = ethers.BigNumber.from("75").mul(Util.RESERVE_ONE);

    const constants = [staticPrice];
    const vBasePrice = op(Opcode.VAL, 0);

    const sources = [concat([vBasePrice])];

    const [sale] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
        calculatePriceStateConfig: {
          sources,
          constants,
          stackLength: 1,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        cooldownDuration: 1,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
        distributionEndForwardingAddress: ethers.constants.AddressZero,
      }
    );

    const saleReserve = await sale.reserve();
    const saleToken = await sale.token();
    const saleStatus: SaleStatus = await sale.saleStatus();

    // sanity check
    assert(saleStatus === SaleStatus.Pending, "wrong sale status: not Pending");

    const saleEscrowWrapper = (await Util.basicDeploy(
      "SaleEscrowWrapper",
      {}
    )) as SaleEscrowWrapper & Contract;

    await saleEscrowWrapper.fetchReserve(sale.address);
    await saleEscrowWrapper.fetchToken(sale.address);
    await saleEscrowWrapper.fetchEscrowStatus(sale.address);

    const saleEscrowReserve = await saleEscrowWrapper.getReserve(sale.address);
    const saleEscrowToken = await saleEscrowWrapper.getToken(sale.address);
    const saleEscrowStatus: EscrowStatus =
      await saleEscrowWrapper.getEscrowStatus(sale.address);

    assert(
      saleReserve === saleEscrowReserve,
      "sale escrow fetched incorrect reserve address"
    );
    assert(
      saleToken === saleEscrowToken,
      "sale escrow fetched incorrect token address"
    );
    assert(
      saleEscrowStatus === EscrowStatus.Pending,
      "wrong sale escrow status: not Pending"
    );
  });
});
