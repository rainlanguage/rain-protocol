import * as Util from "../Util";
import chai from "chai";
import { artifacts, ethers } from "hardhat";
import { ReserveToken } from "../../typechain/ReserveToken";
import { Contract } from "ethers";
import { ReadWriteTier } from "../../typechain/ReadWriteTier";
import { TrustEscrowWrapper } from "../../typechain/TrustEscrowWrapper";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  TrustConfigStruct,
  TrustRedeemableERC20ConfigStruct,
  TrustSeedERC20ConfigStruct,
} from "../../typechain/Trust";
import { TrustMutableAddressesTest } from "../../typechain/TrustMutableAddressesTest";
import {
  ImplementationEvent as ImplementationEventTrustTestFactory,
  TrustMutableAddressesTestFactory,
} from "../../typechain/TrustMutableAddressesTestFactory";
import {
  ImplementationEvent as ImplementationEventSeedERC20,
  SeedERC20Factory,
} from "../../typechain/SeedERC20Factory";
import {
  ImplementationEvent as ImplementationEventRedeemableERC20,
  RedeemableERC20Factory,
} from "../../typechain/RedeemableERC20Factory";
import { CRPFactory } from "../../typechain/CRPFactory";
import { BFactory } from "../../typechain/BFactory";

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

export interface Factories {
  redeemableERC20Factory: RedeemableERC20Factory & Contract;
  seedERC20Factory: SeedERC20Factory & Contract;
  trustTestFactory: TrustMutableAddressesTestFactory & Contract;
}

const factoriesTestDeploy = async (
  crpFactory: CRPFactory & Contract,
  balancerFactory: BFactory & Contract
): Promise<Factories> => {
  const redeemableERC20FactoryFactory = await ethers.getContractFactory(
    "RedeemableERC20Factory",
    {}
  );
  const redeemableERC20Factory =
    (await redeemableERC20FactoryFactory.deploy()) as RedeemableERC20Factory &
      Contract;
  await redeemableERC20Factory.deployed();

  const { implementation: implementation0 } = (await Util.getEventArgs(
    redeemableERC20Factory.deployTransaction,
    "Implementation",
    redeemableERC20Factory
  )) as ImplementationEventRedeemableERC20["args"];
  assert(
    !(implementation0 === Util.zeroAddress),
    "implementation redeemableERC20 factory zero address"
  );

  const seedERC20FactoryFactory = await ethers.getContractFactory(
    "SeedERC20Factory",
    {}
  );
  const seedERC20Factory =
    (await seedERC20FactoryFactory.deploy()) as SeedERC20Factory & Contract;
  await seedERC20Factory.deployed();

  const { implementation: implementation1 } = (await Util.getEventArgs(
    seedERC20Factory.deployTransaction,
    "Implementation",
    seedERC20Factory
  )) as ImplementationEventSeedERC20["args"];
  assert(
    !(implementation1 === Util.zeroAddress),
    "implementation seedERC20 factory zero address"
  );

  const trustTestFactoryFactory = await ethers.getContractFactory(
    "TrustMutableAddressesTestFactory"
  );
  const trustTestFactory = (await trustTestFactoryFactory.deploy({
    redeemableERC20Factory: redeemableERC20Factory.address,
    seedERC20Factory: seedERC20Factory.address,
    crpFactory: crpFactory.address,
    balancerFactory: balancerFactory.address,
    creatorFundsReleaseTimeout: Util.CREATOR_FUNDS_RELEASE_TIMEOUT_TESTING,
    maxRaiseDuration: Util.MAX_RAISE_DURATION_TESTING,
  })) as TrustMutableAddressesTestFactory & Contract;
  await trustTestFactory.deployed();

  const { implementation: implementation2 } = (await Util.getEventArgs(
    trustTestFactory.deployTransaction,
    "Implementation",
    trustTestFactory
  )) as ImplementationEventTrustTestFactory["args"];
  assert(
    !(implementation2 === Util.zeroAddress),
    "implementation trust factory zero address"
  );

  return {
    redeemableERC20Factory,
    seedERC20Factory,
    trustTestFactory,
  };
};

const trustMutableAddressesTestDeploy = async (
  trustTestFactory: TrustMutableAddressesTestFactory & Contract,
  creator: SignerWithAddress,
  trustConfig: TrustConfigStruct,
  trustRedeemableERC20Config: TrustRedeemableERC20ConfigStruct,
  trustSeedERC20Config: TrustSeedERC20ConfigStruct,
  ...args
): Promise<TrustMutableAddressesTest & Contract> => {
  const txDeploy = await trustTestFactory.createChildTyped(
    trustConfig,
    trustRedeemableERC20Config,
    trustSeedERC20Config,
    ...args
  );

  const trustTest = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await Util.getEventArgs(txDeploy, "NewChild", trustTestFactory)).child
      ),
      20 // address bytes length
    ),
    (await artifacts.readArtifact("TrustMutableAddressesTest")).abi,
    creator
  ) as TrustMutableAddressesTest & Contract;

  if (!ethers.utils.isAddress(trustTest.address)) {
    throw new Error(
      `invalid trust address: ${trustTest.address} (${trustTest.address.length} chars)`
    );
  }

  await trustTest.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  trustTest.deployTransaction = txDeploy;

  return trustTest;
};

describe("TrustEscrow", async function () {
  it("should prevent 'malicious' trust contract from modifying crp address", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const creator = signers[0];
    const seeder = signers[1];

    const [crpFactory, balancerFactory] = await Util.balancerDeploy();

    const { trustTestFactory } = await factoriesTestDeploy(
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

    const trustMutableAddressesTest = await trustMutableAddressesTestDeploy(
      trustTestFactory,
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

    const trustEscrowWrapper = (await Util.basicDeploy(
      "TrustEscrowWrapper",
      {}
    )) as TrustEscrowWrapper & Contract;

    // sale escrow indexes addresses, and escrow status
    await trustEscrowWrapper.fetchReserve(trustMutableAddressesTest.address);
    await trustEscrowWrapper.fetchToken(trustMutableAddressesTest.address);
    await trustEscrowWrapper.fetchCrp(trustMutableAddressesTest.address);
    await trustEscrowWrapper.fetchEscrowStatus(
      trustMutableAddressesTest.address
    );

    const trustEscrowReserve0 = await trustEscrowWrapper.getReserve(
      trustMutableAddressesTest.address
    );
    const trustEscrowToken0 = await trustEscrowWrapper.getToken(
      trustMutableAddressesTest.address
    );
    const trustEscrowCrp0 = await trustEscrowWrapper.getCrp(
      trustMutableAddressesTest.address
    );

    const newReserve = ethers.Wallet.createRandom();
    const newToken = ethers.Wallet.createRandom();
    const newCrp = ethers.Wallet.createRandom();

    await trustMutableAddressesTest.updateReserve(newReserve.address);
    await trustMutableAddressesTest.updateToken(newToken.address);
    await trustMutableAddressesTest.updateCrp(newCrp.address);

    await trustEscrowWrapper.fetchReserve(trustMutableAddressesTest.address);
    await trustEscrowWrapper.fetchToken(trustMutableAddressesTest.address);
    await trustEscrowWrapper.fetchCrp(trustMutableAddressesTest.address);

    const trustEscrowReserve1 = await trustEscrowWrapper.getReserve(
      trustMutableAddressesTest.address
    );
    const trustEscrowToken1 = await trustEscrowWrapper.getToken(
      trustMutableAddressesTest.address
    );
    const trustEscrowCrp1 = await trustEscrowWrapper.getCrp(
      trustMutableAddressesTest.address
    );

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
