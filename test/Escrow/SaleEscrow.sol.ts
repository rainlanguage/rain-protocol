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
import { RedeemableERC20Unfreezable } from "../../typechain/RedeemableERC20Unfreezable";
import { RedeemableERC20UnfreezableFactory } from "../../typechain/RedeemableERC20UnfreezableFactory";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  SaleWithUnfreezableToken,
  SaleConfigStruct as SaleWithUnfreezableTokenConfigStruct,
  SaleRedeemableERC20ConfigStruct as SaleWithUnfreezableTokenRedeemableERC20ConfigStruct,
} from "../../typechain/SaleWithUnfreezableToken";
import { SaleWithUnfreezableTokenFactory } from "../../typechain/SaleWithUnfreezableTokenFactory";
import { RedeemableERC20ClaimEscrow } from "../../typechain/RedeemableERC20ClaimEscrow";
import { SaleFactory } from "../../typechain/SaleFactory";
import { MockISale } from "../../typechain/MockISale";
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

let reserve: ReserveToken & Contract,
  redeemableERC20FactoryFactory: ContractFactory,
  redeemableERC20Factory: RedeemableERC20Factory & Contract,
  readWriteTierFactory: ContractFactory,
  readWriteTier: ReadWriteTier & Contract,
  saleConstructorConfig: SaleConstructorConfigStruct,
  saleFactoryFactory: ContractFactory,
  saleFactory: SaleFactory & Contract;

const saleWithUnfreezableTokenDeploy = async (
  signers: SignerWithAddress[],
  deployer: SignerWithAddress,
  saleUnfreezableFactory: SaleWithUnfreezableTokenFactory & Contract,
  config: SaleWithUnfreezableTokenConfigStruct,
  saleRedeemableERC20Config: SaleWithUnfreezableTokenRedeemableERC20ConfigStruct,
  ...args
): Promise<
  [SaleWithUnfreezableToken & Contract, RedeemableERC20Unfreezable & Contract]
> => {
  const txDeploy = await saleUnfreezableFactory.createChildTyped(
    config,
    saleRedeemableERC20Config,
    ...args
  );

  const saleWithUnfreezableToken = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(txDeploy, "NewChild", saleUnfreezableFactory)).child
      ),
      20 // address bytes length
    ),
    (await artifacts.readArtifact("SaleWithUnfreezableToken")).abi,
    deployer
  ) as SaleWithUnfreezableToken & Contract;

  if (!ethers.utils.isAddress(saleWithUnfreezableToken.address)) {
    throw new Error(
      `invalid sale address: ${saleWithUnfreezableToken.address} (${saleWithUnfreezableToken.address.length} chars)`
    );
  }

  await saleWithUnfreezableToken.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  saleWithUnfreezableToken.deployTransaction = txDeploy;

  let token = new ethers.Contract(
    await saleWithUnfreezableToken.token(),
    (await artifacts.readArtifact("RedeemableERC20Unfreezable")).abi
  ) as RedeemableERC20Unfreezable & Contract;

  token = token.connect(signers[0]); // need to do this for some reason

  return [saleWithUnfreezableToken, token];
};

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
    )) as SaleFactory & Contract;
    await saleFactory.deployed();
  });

  it("if a sale creates a redeemable token that doesn't freeze, it should not be possible to drain the RedeemableERC20ClaimEscrow by repeatedly claiming after moving the same funds somewhere else (in the case of failed Sale)", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    // Deploy global Claim contract
    const escrowFactory = await ethers.getContractFactory(
      "RedeemableERC20ClaimEscrow"
    );
    const escrow =
      (await escrowFactory.deploy()) as RedeemableERC20ClaimEscrow & Contract;

    const tokenFactory = await ethers.getContractFactory("ReserveToken");
    const reserve = (await tokenFactory.deploy()) as Contract & IERC20;
    const token = (await tokenFactory.deploy()) as Contract & IERC20;

    await reserve.deployed();
    await token.deployed();

    const saleFactory = await ethers.getContractFactory("MockISale");
    const sale1 = (await saleFactory.deploy()) as Contract & MockISale;
    const sale2 = (await saleFactory.deploy()) as Contract & MockISale;

    // Two identical successful sales with some tokens to distribute.
    let sales: Array<MockISale> = [sale1, sale2];
    for (let sale of sales) {
      await sale.deployed();
      await sale.setReserve(reserve.address);
      await sale.setToken(token.address);
      await sale.setSaleStatus(SaleStatus.Success);
      await reserve.approve(escrow.address, 1000);
      await escrow.deposit(sale.address, reserve.address, 1000);
    }

    assert(
      (await token.balanceOf(signers[1].address)).eq(0),
      "signer 1 had token balance prematurely"
    );
    // If signers[1] has all the token they should get all deposited reserve.
    token.transfer(signers[1].address, await token.totalSupply());

    await escrow
      .connect(signers[1])
      .withdraw(sale1.address, reserve.address, await token.totalSupply());

    assert(
      (await reserve.balanceOf(signers[1].address)).eq(1000),
      `signer 1 did not withdraw the deposited reserve`
    );

    // At this point signer 1 has withdrawn all they can for sale1.
    await Util.assertError(
      async () =>
        await escrow
          .connect(signers[1])
          .withdraw(sale1.address, reserve.address, await token.totalSupply()),
      "ZERO_WITHDRAW",
      "didn't prevent signer 1 from withdrawing a second time"
    );

    // At this point there is still 1000 reserve in the escrow (for sale2).
    // We want to prevent signer 1 from colluding with signer 2 to withdraw
    // more funds from sale1 than were ever deposited for it. If this were
    // possible then malicious ISale contracts can steal from honest contracts.
    await token
      .connect(signers[1])
      .transfer(signers[2].address, await token.totalSupply());
    // This has to underflow here as signers[2] is now trying to withdraw 1000
    // reserve tokens, which means 2000 reserve tokens total withdrawn from
    // sale1 vs. 1000 tokens deposited for sale1.
    await Util.assertError(
      async () =>
        await escrow
          .connect(signers[2])
          .withdraw(sale1.address, reserve.address, await token.totalSupply()),
      "underflowed",
      "didn't prevent signer 2 from withdrawing from sale1 what was already withdrawn"
    );

    // However, it's entirely possible for signer[2] to withdraw 1000 tokens
    // from sale2 as sale1 and sale2 share the same non-reserve token.
    await escrow
      .connect(signers[2])
      .withdraw(sale2.address, reserve.address, await token.totalSupply());

    assert(
      (await reserve.balanceOf(signers[1].address)).eq(1000),
      `signer 1 has incorrect reserve.`
    );
    assert(
      (await reserve.balanceOf(signers[2].address)).eq(1000),
      `signer 2 has incorrect reserve.`
    );
    assert(
      (await reserve.balanceOf(escrow.address)).eq(0),
      `escrow has incorrect reserve.`
    );
  });

  it("should prevent 'malicious' sale contract from modifying fail status", async function () {
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

    await saleEscrowWrapper.fetchEscrowStatus(saleMutableAddressesTest.address);
    const saleEscrowStatus0: EscrowStatus =
      await saleEscrowWrapper.getEscrowStatus(saleMutableAddressesTest.address);

    await saleMutableAddressesTest.updateStatus(SaleStatus.Active);

    await saleEscrowWrapper.fetchEscrowStatus(saleMutableAddressesTest.address);
    const saleEscrowStatus1: EscrowStatus =
      await saleEscrowWrapper.getEscrowStatus(saleMutableAddressesTest.address);

    await saleMutableAddressesTest.updateStatus(SaleStatus.Fail);

    await saleEscrowWrapper.fetchEscrowStatus(saleMutableAddressesTest.address);
    const saleEscrowStatus2: EscrowStatus =
      await saleEscrowWrapper.getEscrowStatus(saleMutableAddressesTest.address);

    await saleMutableAddressesTest.updateStatus(SaleStatus.Success);

    await saleEscrowWrapper.fetchEscrowStatus(saleMutableAddressesTest.address);
    const saleEscrowStatus3: EscrowStatus =
      await saleEscrowWrapper.getEscrowStatus(saleMutableAddressesTest.address);

    assert(saleEscrowStatus0 === EscrowStatus.Pending);
    assert(saleEscrowStatus1 === EscrowStatus.Pending);
    assert(saleEscrowStatus2 === EscrowStatus.Fail);
    assert(saleEscrowStatus3 === EscrowStatus.Fail);
  });

  it("should prevent 'malicious' sale contract from modifying success status", async function () {
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

    await saleEscrowWrapper.fetchEscrowStatus(saleMutableAddressesTest.address);
    const saleEscrowStatus0: EscrowStatus =
      await saleEscrowWrapper.getEscrowStatus(saleMutableAddressesTest.address);

    await saleMutableAddressesTest.updateStatus(SaleStatus.Active);

    await saleEscrowWrapper.fetchEscrowStatus(saleMutableAddressesTest.address);
    const saleEscrowStatus1: EscrowStatus =
      await saleEscrowWrapper.getEscrowStatus(saleMutableAddressesTest.address);

    await saleMutableAddressesTest.updateStatus(SaleStatus.Success);

    await saleEscrowWrapper.fetchEscrowStatus(saleMutableAddressesTest.address);
    const saleEscrowStatus2: EscrowStatus =
      await saleEscrowWrapper.getEscrowStatus(saleMutableAddressesTest.address);

    await saleMutableAddressesTest.updateStatus(SaleStatus.Fail);

    await saleEscrowWrapper.fetchEscrowStatus(saleMutableAddressesTest.address);
    const saleEscrowStatus3: EscrowStatus =
      await saleEscrowWrapper.getEscrowStatus(saleMutableAddressesTest.address);

    assert(saleEscrowStatus0 === EscrowStatus.Pending);
    assert(saleEscrowStatus1 === EscrowStatus.Pending);
    assert(saleEscrowStatus2 === EscrowStatus.Success);
    assert(saleEscrowStatus3 === EscrowStatus.Success);
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
