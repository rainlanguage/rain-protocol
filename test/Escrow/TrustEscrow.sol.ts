import * as Util from "../Util";
import chai from "chai";
import { ethers } from "hardhat";
import { ReserveToken } from "../../typechain/ReserveToken";
import { Contract } from "ethers";
import { ReadWriteTier } from "../../typechain/ReadWriteTier";
import { TrustEscrowWrapper } from "../../typechain/TrustEscrowWrapper";
import { MockTrustISale } from "../../typechain/MockTrustISale";
import { IERC20 } from "../../typechain/IERC20";

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

describe("TrustEscrow", async function () {
  it("should prevent 'malicious' trust contract from modifying fail status", async function () {
    this.timeout(0);

    const trustFactory = await ethers.getContractFactory("MockTrustISale");
    const trust = (await trustFactory.deploy()) as Contract & MockTrustISale;

    const trustEscrowWrapper = (await Util.basicDeploy(
      "TrustEscrowWrapper",
      {}
    )) as TrustEscrowWrapper & Contract;

    const tokenFactory = await ethers.getContractFactory("ReserveToken");
    const reserve = (await tokenFactory.deploy()) as Contract & IERC20;
    const rTKN = (await tokenFactory.deploy()) as Contract & IERC20;

    await reserve.deployed();
    await rTKN.deployed();

    await trust.setReserve(reserve.address);
    await trust.setToken(rTKN.address);
    await trust.setSaleStatus(SaleStatus.Pending);

    await trustEscrowWrapper.fetchEscrowStatus(trust.address);
    const trustEscrowStatus0: EscrowStatus =
      await trustEscrowWrapper.getEscrowStatus(trust.address);

    await trust.setSaleStatus(SaleStatus.Active);

    await trustEscrowWrapper.fetchEscrowStatus(trust.address);
    const trustEscrowStatus1: EscrowStatus =
      await trustEscrowWrapper.getEscrowStatus(trust.address);

    await trust.setSaleStatus(SaleStatus.Fail);

    await trustEscrowWrapper.fetchEscrowStatus(trust.address);
    const trustEscrowStatus2: EscrowStatus =
      await trustEscrowWrapper.getEscrowStatus(trust.address);

    await trust.setSaleStatus(SaleStatus.Success);

    await trustEscrowWrapper.fetchEscrowStatus(trust.address);
    const trustEscrowStatus3: EscrowStatus =
      await trustEscrowWrapper.getEscrowStatus(trust.address);

    assert(trustEscrowStatus0 === EscrowStatus.Pending);
    assert(trustEscrowStatus1 === EscrowStatus.Pending);
    assert(trustEscrowStatus2 === EscrowStatus.Fail);
    assert(trustEscrowStatus3 === EscrowStatus.Fail);
  });

  it("should prevent 'malicious' trust contract from modifying success status", async function () {
    this.timeout(0);

    const trustFactory = await ethers.getContractFactory("MockTrustISale");
    const trust = (await trustFactory.deploy()) as Contract & MockTrustISale;

    const trustEscrowWrapper = (await Util.basicDeploy(
      "TrustEscrowWrapper",
      {}
    )) as TrustEscrowWrapper & Contract;

    const tokenFactory = await ethers.getContractFactory("ReserveToken");
    const reserve = (await tokenFactory.deploy()) as Contract & IERC20;
    const rTKN = (await tokenFactory.deploy()) as Contract & IERC20;

    await reserve.deployed();
    await rTKN.deployed();

    await trust.setReserve(reserve.address);
    await trust.setToken(rTKN.address);
    await trust.setSaleStatus(SaleStatus.Pending);

    await trustEscrowWrapper.fetchEscrowStatus(trust.address);
    const trustEscrowStatus0: EscrowStatus =
      await trustEscrowWrapper.getEscrowStatus(trust.address);

    await trust.setSaleStatus(SaleStatus.Active);

    await trustEscrowWrapper.fetchEscrowStatus(trust.address);
    const trustEscrowStatus1: EscrowStatus =
      await trustEscrowWrapper.getEscrowStatus(trust.address);

    await trust.setSaleStatus(SaleStatus.Success);

    await trustEscrowWrapper.fetchEscrowStatus(trust.address);
    const trustEscrowStatus2: EscrowStatus =
      await trustEscrowWrapper.getEscrowStatus(trust.address);

    await trust.setSaleStatus(SaleStatus.Fail);

    await trustEscrowWrapper.fetchEscrowStatus(trust.address);
    const trustEscrowStatus3: EscrowStatus =
      await trustEscrowWrapper.getEscrowStatus(trust.address);

    assert(trustEscrowStatus0 === EscrowStatus.Pending);
    assert(trustEscrowStatus1 === EscrowStatus.Pending);
    assert(trustEscrowStatus2 === EscrowStatus.Success);
    assert(trustEscrowStatus3 === EscrowStatus.Success);
  });

  it("should prevent 'malicious' trust contract from modifying reserve, token and crp addresses", async function () {
    this.timeout(0);

    const trustFactory = await ethers.getContractFactory("MockTrustISale");
    const trust = (await trustFactory.deploy()) as Contract & MockTrustISale;

    const trustEscrowWrapper = (await Util.basicDeploy(
      "TrustEscrowWrapper",
      {}
    )) as TrustEscrowWrapper & Contract;

    const tokenFactory = await ethers.getContractFactory("ReserveToken");
    const reserve = (await tokenFactory.deploy()) as Contract & IERC20;
    const rTKN = (await tokenFactory.deploy()) as Contract & IERC20;
    const crp = ethers.Wallet.createRandom();

    await reserve.deployed();
    await rTKN.deployed();

    await trust.setReserve(reserve.address);
    await trust.setToken(rTKN.address);
    await trust.setSaleStatus(SaleStatus.Pending);
    await trust.setCrp(crp.address);

    // trust escrow indexes addresses, and escrow status
    await trustEscrowWrapper.fetchReserve(trust.address);
    await trustEscrowWrapper.fetchToken(trust.address);
    await trustEscrowWrapper.fetchCrp(trust.address);
    await trustEscrowWrapper.fetchEscrowStatus(trust.address);

    const trustEscrowReserve0 = await trustEscrowWrapper.getReserve(
      trust.address
    );
    const trustEscrowToken0 = await trustEscrowWrapper.getToken(trust.address);
    const trustEscrowCrp0 = await trustEscrowWrapper.getCrp(trust.address);

    const newReserve = ethers.Wallet.createRandom();
    const newToken = ethers.Wallet.createRandom();
    const newCrp = ethers.Wallet.createRandom();

    assert(
      newCrp.address !== crp.address,
      "sanity check new random crp address did not pass"
    );

    await trust.setReserve(newReserve.address);
    await trust.setToken(newToken.address);
    await trust.setCrp(newCrp.address);

    await trustEscrowWrapper.fetchReserve(trust.address);
    await trustEscrowWrapper.fetchToken(trust.address);
    await trustEscrowWrapper.fetchCrp(trust.address);

    const trustEscrowReserve1 = await trustEscrowWrapper.getReserve(
      trust.address
    );
    const trustEscrowToken1 = await trustEscrowWrapper.getToken(trust.address);
    const trustEscrowCrp1 = await trustEscrowWrapper.getCrp(trust.address);

    assert(
      trustEscrowReserve0 === trustEscrowReserve1,
      "trust escrow wrongly updated reserve address"
    );
    assert(
      trustEscrowToken0 === trustEscrowToken1,
      "trust escrow wrongly updated token address"
    );
    assert(
      trustEscrowCrp0 === trustEscrowCrp1,
      "trust escrow wrongly updated crp address"
    );
  });

  it("should return addresses and escrow status of Pending after Trust initialisation", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const creator = signers[0];
    const seeder = signers[1];

    const [crpFactory, balancerFactory] = await Util.balancerDeploy();

    const { trustFactory } = await Util.factoriesDeploy(
      crpFactory,
      balancerFactory
    );

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const minimumTier = 0;

    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };
    const seederUnits = 0;
    const seedERC20Config = {
      name: "SeedToken",
      symbol: "SDT",
      distributor: Util.zeroAddress,
      initialSupply: seederUnits,
    };

    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);

    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederCooldownDuration = 0;

    const successLevel = reserveInit
      .add(seederFee)
      .add(redeemInit)
      .add(minimumCreatorRaise);

    const minimumTradingDuration = 100;

    const readWriteTierFactory = await ethers.getContractFactory(
      "ReadWriteTier"
    );
    const readWriteTier =
      (await readWriteTierFactory.deploy()) as ReadWriteTier & Contract;
    await readWriteTier.deployed();

    const trust = await Util.trustDeploy(
      trustFactory,
      creator,
      {
        creator: creator.address,
        minimumCreatorRaise,
        seederFee,
        redeemInit,
        reserve: reserve.address,
        reserveInit,
        initialValuation,
        finalValuation: successLevel,
        minimumTradingDuration,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier,
      },
      {
        seeder: seeder.address,
        cooldownDuration: seederCooldownDuration,
        erc20Config: seedERC20Config,
      },
      { gasLimit: 100000000 }
    );

    const trustReserve = await trust.reserve();
    const trustToken = await trust.token();
    const trustCrp = await trust.crp();
    const trustStatus: SaleStatus = await trust.saleStatus();

    // sanity check
    assert(
      trustStatus === SaleStatus.Pending,
      "wrong trust status: not Pending"
    );

    const trustEscrowWrapper = (await Util.basicDeploy(
      "TrustEscrowWrapper",
      {}
    )) as TrustEscrowWrapper & Contract;

    // sale escrow indexes addresses, and escrow status
    await trustEscrowWrapper.fetchReserve(trust.address);
    await trustEscrowWrapper.fetchToken(trust.address);
    await trustEscrowWrapper.fetchCrp(trust.address);
    await trustEscrowWrapper.fetchEscrowStatus(trust.address);

    const trustEscrowReserve = await trustEscrowWrapper.getReserve(
      trust.address
    );
    const trustEscrowToken = await trustEscrowWrapper.getToken(trust.address);
    const trustEscrowCrp = await trustEscrowWrapper.getCrp(trust.address);
    const trustEscrowStatus: EscrowStatus =
      await trustEscrowWrapper.getEscrowStatus(trust.address);

    assert(
      trustReserve === trustEscrowReserve,
      "trust escrow fetched incorrect reserve address"
    );
    assert(
      trustToken === trustEscrowToken,
      "trust escrow fetched incorrect token address"
    );
    assert(
      trustCrp === trustEscrowCrp,
      "trust escrow fetched incorrect crp address"
    );
    assert(
      trustEscrowStatus === EscrowStatus.Pending,
      "wrong trust escrow status: not Pending"
    );
  });
});
