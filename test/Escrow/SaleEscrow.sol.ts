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
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  BuyEvent,
  SaleWithUnfreezableToken,
} from "../../typechain/SaleWithUnfreezableToken";
import { RedeemableERC20ClaimEscrow } from "../../typechain/RedeemableERC20ClaimEscrow";
import { RedeemableERC20ClaimEscrowWrapper } from "../../typechain/RedeemableERC20ClaimEscrowWrapper";

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

const saleWithUnfreezableTokenDeploy = async (
  signers: SignerWithAddress[],
  deployer: SignerWithAddress,
  saleTestFactory: SaleMutableAddressesTestFactory & Contract,
  config: SaleConfigStruct,
  saleRedeemableERC20Config: SaleRedeemableERC20ConfigStruct,
  ...args
): Promise<
  [SaleWithUnfreezableToken & Contract, RedeemableERC20Unfreezable & Contract]
> => {
  const txDeploy = await saleTestFactory.createChildTyped(
    config,
    saleRedeemableERC20Config,
    ...args
  );

  const saleWithUnfreezableToken = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(txDeploy, "NewChild", saleTestFactory)).child
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
    )) as SaleMutableAddressesTestFactory & Contract;
    await saleFactory.deployed();
  });

  it("if a sale creates a redeemable token that doesn't freeze, it should not be possible to drain the RedeemableERC20ClaimEscrow by repeatedly claiming after moving the same funds somewhere else (in the case of failed Sale)", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const feeRecipient = signers[2];
    const signer1 = signers[3];
    const signer2 = signers[4];

    // Deploy global Claim contract
    const claimFactory = await ethers.getContractFactory(
      "RedeemableERC20ClaimEscrow"
    );
    const claim = (await claimFactory.deploy()) as RedeemableERC20ClaimEscrow &
      Contract;

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

    const [saleWithUnfreezableToken, unfreezableToken] =
      await saleWithUnfreezableTokenDeploy(
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

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    const desiredUnits = totalTokenSupply.div(100);
    const cost = staticPrice.mul(desiredUnits).div(Util.ONE);

    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, cost.add(fee));
    const signer1ReserveBalance = await reserve.balanceOf(signer1.address);
    await reserve
      .connect(signer1)
      .approve(saleWithUnfreezableToken.address, signer1ReserveBalance);

    // give signer2 reserve to cover cost + fee
    await reserve.transfer(signer2.address, cost.add(fee));
    const signer2ReserveBalance = await reserve.balanceOf(signer2.address);
    await reserve
      .connect(signer2)
      .approve(saleWithUnfreezableToken.address, signer2ReserveBalance);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    await saleWithUnfreezableToken.start();

    // buy redeemable tokens during sale
    await saleWithUnfreezableToken.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnits,
      desiredUnits,
      maximumPrice: staticPrice,
    });
    await saleWithUnfreezableToken.connect(signer2).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnits,
      desiredUnits,
      maximumPrice: staticPrice,
    });

    // wait until sale can end
    await Util.createEmptyBlock(
      saleTimeout + startBlock - (await ethers.provider.getBlockNumber())
    );

    await saleWithUnfreezableToken.end();

    // signer1 deposit
    await claim
      .connect(signer1)
      .deposit(
        saleWithUnfreezableToken.address,
        unfreezableToken.address,
        await unfreezableToken.balanceOf(signer1.address)
      );

    // // signer2 deposit
    // await claim
    //   .connect(signer2)
    //   .deposit(saleWithUnfreezableToken.address, unfreezableToken.address, 100);

    // // undeposit
    // await claim
    //   .connect(signer1)
    //   .undeposit(
    //     saleWithUnfreezableToken.address,
    //     unfreezableToken.address,
    //     totalTokenSupply,
    //     10
    //   );
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
