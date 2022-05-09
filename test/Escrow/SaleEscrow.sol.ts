import * as Util from "../Util";
import chai from "chai";
import { ethers } from "hardhat";
import { op } from "../Util";
import { Status } from "../Sale/SaleUtil";
import { concat } from "ethers/lib/utils";
import { ReserveToken } from "../../typechain/ReserveToken";
import { Contract, ContractFactory } from "ethers";
import { RedeemableERC20Factory } from "../../typechain/RedeemableERC20Factory";
import { ReadWriteTier } from "../../typechain/ReadWriteTier";
import { SaleConstructorConfigStruct } from "../../typechain/Sale";
import { SaleEscrowWrapper } from "../../typechain/SaleEscrowWrapper";
import { RedeemableERC20ClaimEscrow } from "../../typechain/RedeemableERC20ClaimEscrow";
import { SaleFactory } from "../../typechain/SaleFactory";
import { MockISale } from "../../typechain/MockISale";
import { IERC20 } from "../../typechain/IERC20";
import type { RedeemableERC20 } from "../../typechain/RedeemableERC20";

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
  saleFactory: SaleFactory & Contract;

describe("SaleEscrow", async function () {
  beforeEach(async () => {
    reserve = (await Util.basicDeploy("ReserveToken", {})) as ReserveToken &
      Contract;
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
      (await redeemableERC20FactoryFactory.deploy()) as RedeemableERC20Factory &
        Contract;
    await redeemableERC20Factory.deployed();

    readWriteTierFactory = await ethers.getContractFactory("ReadWriteTier");
    readWriteTier = (await readWriteTierFactory.deploy()) as ReadWriteTier &
      Contract;
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
    )) as SaleFactory & Contract;
    await saleFactory.deployed();
  });

  it("if a sale creates a redeemable token that doesn't freeze, it should not be possible to drain the RedeemableERC20ClaimEscrow by repeatedly claiming after moving the same funds somewhere else (in the case of failed Sale)", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const signer1 = signers[1];
    const signer2 = signers[2];

    // Deploy global Claim contract
    const rTKNClaimEscrowFactory = await ethers.getContractFactory(
      "RedeemableERC20ClaimEscrow"
    );
    const rTKNClaimEscrow =
      (await rTKNClaimEscrowFactory.deploy()) as RedeemableERC20ClaimEscrow &
        Contract;

    const tokenFactory = await ethers.getContractFactory("ReserveToken");
    const reserve = (await tokenFactory.deploy()) as Contract & IERC20;
    const rTKN = (await tokenFactory.deploy()) as Contract & IERC20;

    await reserve.deployed();
    await rTKN.deployed();

    const saleFactory = await ethers.getContractFactory("MockISale");
    const sale1 = (await saleFactory.deploy()) as Contract & MockISale;
    const sale2 = (await saleFactory.deploy()) as Contract & MockISale;

    // Two identical successful sales with some tokens to distribute.
    const sales: Array<Contract & MockISale> = [sale1, sale2];
    for (const sale of sales) {
      await sale.deployed();
      await sale.setReserve(reserve.address);
      await sale.setToken(rTKN.address);
      await sale.setSaleStatus(SaleStatus.Success);
      await reserve.approve(rTKNClaimEscrow.address, 1000);
      await rTKNClaimEscrow.deposit(sale.address, reserve.address, 1000);
    }

    assert(
      (await rTKN.balanceOf(signer1.address)).eq(0),
      "signer 1 had token balance prematurely"
    );
    // If signer1 has all the token they should get all deposited reserve.
    await rTKN.transfer(signer1.address, await rTKN.totalSupply());

    await rTKNClaimEscrow
      .connect(signer1)
      .withdraw(sale1.address, reserve.address, await rTKN.totalSupply());

    assert(
      (await reserve.balanceOf(signer1.address)).eq(1000),
      `signer 1 did not withdraw the deposited reserve`
    );

    // At this point signer 1 has withdrawn all they can for sale1.
    await Util.assertError(
      async () =>
        await rTKNClaimEscrow
          .connect(signer1)
          .withdraw(sale1.address, reserve.address, await rTKN.totalSupply()),
      "ZERO_WITHDRAW",
      "didn't prevent signer 1 from withdrawing a second time"
    );

    // At this point there is still 1000 reserve in the escrow (for sale2).
    // We want to prevent signer 1 from colluding with signer 2 to withdraw
    // more funds from sale1 than were ever deposited for it. If this were
    // possible then malicious ISale contracts can steal from honest contracts.
    await rTKN
      .connect(signer1)
      .transfer(signer2.address, await rTKN.totalSupply());
    // This has to underflow here as signer2 is now trying to withdraw 1000
    // reserve tokens, which means 2000 reserve tokens total withdrawn from
    // sale1 vs. 1000 tokens deposited for sale1.
    await Util.assertError(
      async () =>
        await rTKNClaimEscrow
          .connect(signer2)
          .withdraw(sale1.address, reserve.address, await rTKN.totalSupply()),
      "underflowed",
      "didn't prevent signer 2 from withdrawing from sale1 what was already withdrawn"
    );

    // However, it's entirely possible for signer2 to withdraw 1000 tokens
    // from sale2 as sale1 and sale2 share the same non-reserve token.
    await rTKNClaimEscrow
      .connect(signer2)
      .withdraw(sale2.address, reserve.address, await rTKN.totalSupply());

    assert(
      (await reserve.balanceOf(signer1.address)).eq(1000),
      `signer 1 has incorrect reserve.`
    );
    assert(
      (await reserve.balanceOf(signer2.address)).eq(1000),
      `signer 2 has incorrect reserve.`
    );
    assert(
      (await reserve.balanceOf(rTKNClaimEscrow.address)).eq(0),
      `escrow has incorrect reserve.`
    );
  });

  it("should prevent 'malicious' sale contract from modifying fail status", async function () {
    this.timeout(0);

    const saleFactory = await ethers.getContractFactory("MockISale");
    const sale = (await saleFactory.deploy()) as Contract & MockISale;

    const saleEscrowWrapper = (await Util.basicDeploy(
      "SaleEscrowWrapper",
      {}
    )) as SaleEscrowWrapper & Contract;

    const tokenFactory = await ethers.getContractFactory("ReserveToken");
    const reserve = (await tokenFactory.deploy()) as Contract & IERC20;
    const rTKN = (await tokenFactory.deploy()) as Contract & IERC20;

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
    const sale = (await saleFactory.deploy()) as Contract & MockISale;

    const saleEscrowWrapper = (await Util.basicDeploy(
      "SaleEscrowWrapper",
      {}
    )) as SaleEscrowWrapper & Contract;

    const tokenFactory = await ethers.getContractFactory("ReserveToken");
    const reserve = (await tokenFactory.deploy()) as Contract & IERC20;
    const rTKN = (await tokenFactory.deploy()) as Contract & IERC20;

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
    const sale = (await saleFactory.deploy()) as Contract & MockISale;

    const saleEscrowWrapper = (await Util.basicDeploy(
      "SaleEscrowWrapper",
      {}
    )) as SaleEscrowWrapper & Contract;

    const tokenFactory = await ethers.getContractFactory("ReserveToken");
    const reserve = (await tokenFactory.deploy()) as Contract & IERC20;
    const rTKN = (await tokenFactory.deploy()) as Contract & IERC20;

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

  it("should return reserve and token addresses, and escrow status of Pending, after Sale initialisation", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const totalTokenSupply = ethers.BigNumber.from("2000").mul(Util.ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: deployer.address,
      initialSupply: totalTokenSupply,
    };
    const redeemableERC20 = (await Util.redeemableERC20Deploy(deployer, {
      reserve: reserve.address,
      erc20Config: redeemableERC20Config,
      tier: readWriteTier.address,
      minimumTier: 0,
      distributionEndForwardingAddress: Util.zeroAddress,
    })) as RedeemableERC20 & Contract;

    const saleFactory = await ethers.getContractFactory("MockISale");
    const sale = (await saleFactory.deploy()) as Contract & MockISale;

    await sale.setReserve(reserve.address);
    await sale.setToken(redeemableERC20.address);
    await sale.setSaleStatus(Status.PENDING);

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
