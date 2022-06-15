import { assert } from "chai";
import { ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { IERC20 } from "../../../typechain/IERC20";
import { MockISale } from "../../../typechain/MockISale";
import { ReadWriteTier } from "../../../typechain/ReadWriteTier";
import type { RedeemableERC20 } from "../../../typechain/RedeemableERC20";
import { RedeemableERC20Factory } from "../../../typechain/RedeemableERC20Factory";
import { ReserveToken } from "../../../typechain/ReserveToken";
import { SaleConstructorConfigStruct } from "../../../typechain/Sale";
import { SaleEscrowWrapper } from "../../../typechain/SaleEscrowWrapper";
import { SaleFactory } from "../../../typechain/SaleFactory";
import { zeroAddress } from "../../../utils/constants/address";
import { ONE } from "../../../utils/constants/bigNumber";
import { basicDeploy } from "../../../utils/deploy/basic";
import { redeemableERC20Deploy } from "../../../utils/deploy/redeemableERC20";
import { Status } from "../../../utils/types/sale";
import { EscrowStatus, SaleStatus } from "../../../utils/types/saleEscrow";

let reserve: ReserveToken,
  redeemableERC20FactoryFactory: ContractFactory,
  redeemableERC20Factory: RedeemableERC20Factory,
  readWriteTierFactory: ContractFactory,
  readWriteTier: ReadWriteTier,
  saleConstructorConfig: SaleConstructorConfigStruct,
  saleFactoryFactory: ContractFactory,
  saleFactory: SaleFactory;

describe("SaleEscrow unchangeable addresses", async function () {
  beforeEach(async () => {
    reserve = (await basicDeploy("ReserveToken", {})) as ReserveToken;
  });

  before(async () => {
    const stateBuilderFactory = await ethers.getContractFactory(
      "AllStandardOpsStateBuilder"
    );
    const stateBuilder = await stateBuilderFactory.deploy();
    await stateBuilder.deployed();

    redeemableERC20FactoryFactory = await ethers.getContractFactory(
      "RedeemableERC20Factory",
      {}
    );
    redeemableERC20Factory =
      (await redeemableERC20FactoryFactory.deploy()) as RedeemableERC20Factory;
    await redeemableERC20Factory.deployed();

    readWriteTierFactory = await ethers.getContractFactory("ReadWriteTier");
    readWriteTier = (await readWriteTierFactory.deploy()) as ReadWriteTier;
    await readWriteTier.deployed();

    saleConstructorConfig = {
      maximumSaleTimeout: 1000,
      maximumCooldownDuration: 1000,
      redeemableERC20Factory: redeemableERC20Factory.address,
      vmStateBuilder: stateBuilder.address,
    };

    saleFactoryFactory = await ethers.getContractFactory("SaleFactory", {});
    saleFactory = (await saleFactoryFactory.deploy(
      saleConstructorConfig
    )) as SaleFactory;
    await saleFactory.deployed();
  });

  it("should return reserve and token addresses, and escrow status of Pending, after Sale initialisation", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const totalTokenSupply = ethers.BigNumber.from("2000").mul(ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: deployer.address,
      initialSupply: totalTokenSupply,
    };
    const redeemableERC20 = (await redeemableERC20Deploy(deployer, {
      reserve: reserve.address,
      erc20Config: redeemableERC20Config,
      tier: readWriteTier.address,
      minimumTier: 0,
      distributionEndForwardingAddress: zeroAddress,
    })) as RedeemableERC20;

    const saleFactory = await ethers.getContractFactory("MockISale");
    const sale = (await saleFactory.deploy()) as MockISale;

    await sale.setReserve(reserve.address);
    await sale.setToken(redeemableERC20.address);
    await sale.setSaleStatus(Status.PENDING);

    const saleReserve = await sale.reserve();
    const saleToken = await sale.token();
    const saleStatus: SaleStatus = await sale.saleStatus();

    // sanity check
    assert(saleStatus === SaleStatus.Pending, "wrong sale status: not Pending");

    const saleEscrowWrapper = (await basicDeploy(
      "SaleEscrowWrapper",
      {}
    )) as SaleEscrowWrapper;

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

  it("should prevent 'malicious' sale contract from modifying fail status", async function () {
    this.timeout(0);

    const saleFactory = await ethers.getContractFactory("MockISale");
    const sale = (await saleFactory.deploy()) as MockISale;

    const saleEscrowWrapper = (await basicDeploy(
      "SaleEscrowWrapper",
      {}
    )) as SaleEscrowWrapper;

    const tokenFactory = await ethers.getContractFactory("ReserveToken");
    const reserve = (await tokenFactory.deploy()) as IERC20;
    const rTKN = (await tokenFactory.deploy()) as IERC20;

    await reserve.deployed();
    await rTKN.deployed();

    await sale.setReserve(reserve.address);
    await sale.setToken(rTKN.address);
    await sale.setSaleStatus(SaleStatus.Pending);

    await saleEscrowWrapper.fetchEscrowStatus(sale.address);
    const saleEscrowStatus0: EscrowStatus =
      await saleEscrowWrapper.getEscrowStatus(sale.address);

    await sale.setSaleStatus(SaleStatus.Active);

    await saleEscrowWrapper.fetchEscrowStatus(sale.address);
    const saleEscrowStatus1: EscrowStatus =
      await saleEscrowWrapper.getEscrowStatus(sale.address);

    await sale.setSaleStatus(SaleStatus.Fail);

    await saleEscrowWrapper.fetchEscrowStatus(sale.address);
    const saleEscrowStatus2: EscrowStatus =
      await saleEscrowWrapper.getEscrowStatus(sale.address);

    await sale.setSaleStatus(SaleStatus.Success);

    await saleEscrowWrapper.fetchEscrowStatus(sale.address);
    const saleEscrowStatus3: EscrowStatus =
      await saleEscrowWrapper.getEscrowStatus(sale.address);

    assert(saleEscrowStatus0 === EscrowStatus.Pending);
    assert(saleEscrowStatus1 === EscrowStatus.Pending);
    assert(saleEscrowStatus2 === EscrowStatus.Fail);
    assert(saleEscrowStatus3 === EscrowStatus.Fail);
  });

  it("should prevent 'malicious' sale contract from modifying success status", async function () {
    this.timeout(0);

    const saleFactory = await ethers.getContractFactory("MockISale");
    const sale = (await saleFactory.deploy()) as MockISale;

    const saleEscrowWrapper = (await basicDeploy(
      "SaleEscrowWrapper",
      {}
    )) as SaleEscrowWrapper;

    const tokenFactory = await ethers.getContractFactory("ReserveToken");
    const reserve = (await tokenFactory.deploy()) as IERC20;
    const rTKN = (await tokenFactory.deploy()) as IERC20;

    await reserve.deployed();
    await rTKN.deployed();

    await sale.setReserve(reserve.address);
    await sale.setToken(rTKN.address);
    await sale.setSaleStatus(SaleStatus.Pending);

    await saleEscrowWrapper.fetchEscrowStatus(sale.address);
    const saleEscrowStatus0: EscrowStatus =
      await saleEscrowWrapper.getEscrowStatus(sale.address);

    await sale.setSaleStatus(SaleStatus.Active);

    await saleEscrowWrapper.fetchEscrowStatus(sale.address);
    const saleEscrowStatus1: EscrowStatus =
      await saleEscrowWrapper.getEscrowStatus(sale.address);

    await sale.setSaleStatus(SaleStatus.Success);

    await saleEscrowWrapper.fetchEscrowStatus(sale.address);
    const saleEscrowStatus2: EscrowStatus =
      await saleEscrowWrapper.getEscrowStatus(sale.address);

    await sale.setSaleStatus(SaleStatus.Fail);

    await saleEscrowWrapper.fetchEscrowStatus(sale.address);
    const saleEscrowStatus3: EscrowStatus =
      await saleEscrowWrapper.getEscrowStatus(sale.address);

    assert(saleEscrowStatus0 === EscrowStatus.Pending);
    assert(saleEscrowStatus1 === EscrowStatus.Pending);
    assert(saleEscrowStatus2 === EscrowStatus.Success);
    assert(saleEscrowStatus3 === EscrowStatus.Success);
  });

  it("should prevent 'malicious' sale contract from modifying reserve and token addresses", async function () {
    this.timeout(0);

    const saleFactory = await ethers.getContractFactory("MockISale");
    const sale = (await saleFactory.deploy()) as MockISale;

    const saleEscrowWrapper = (await basicDeploy(
      "SaleEscrowWrapper",
      {}
    )) as SaleEscrowWrapper;

    const tokenFactory = await ethers.getContractFactory("ReserveToken");
    const reserve = (await tokenFactory.deploy()) as IERC20;
    const rTKN = (await tokenFactory.deploy()) as IERC20;

    await reserve.deployed();
    await rTKN.deployed();

    await sale.setReserve(reserve.address);
    await sale.setToken(rTKN.address);
    await sale.setSaleStatus(SaleStatus.Success);

    // sale escrow indexes reserve and token addresses, and escrow status
    await saleEscrowWrapper.fetchReserve(sale.address);
    await saleEscrowWrapper.fetchToken(sale.address);
    await saleEscrowWrapper.fetchEscrowStatus(sale.address);

    const saleEscrowReserve0 = await saleEscrowWrapper.getReserve(sale.address);
    const saleEscrowToken0 = await saleEscrowWrapper.getToken(sale.address);

    const newReserve = ethers.Wallet.createRandom();
    const newToken = ethers.Wallet.createRandom();

    await sale.setReserve(newReserve.address);
    await sale.setToken(newToken.address);

    await saleEscrowWrapper.fetchReserve(sale.address);
    await saleEscrowWrapper.fetchToken(sale.address);

    const saleEscrowReserve1 = await saleEscrowWrapper.getReserve(sale.address);
    const saleEscrowToken1 = await saleEscrowWrapper.getToken(sale.address);

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
});
