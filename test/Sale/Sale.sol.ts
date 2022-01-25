import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { artifacts, ethers } from "hardhat";
import type { Contract, ContractFactory } from "ethers";
import type {
  SaleConfigStruct,
  SaleConstructorConfigStruct,
  SaleFactory,
  SaleRedeemableERC20ConfigStruct,
} from "../../typechain/SaleFactory";
import type { Sale } from "../../typechain/Sale";
import { getEventArgs, op } from "../Util";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ReserveToken } from "../../typechain/ReserveToken";
import { ReadWriteTier } from "../../typechain/ReadWriteTier";
import { RedeemableERC20Factory } from "../../typechain/RedeemableERC20Factory";
import { concat } from "ethers/lib/utils";

chai.use(solidity);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { expect, assert } = chai;

enum Tier {
  ZERO,
  ONE,
  TWO,
  THREE,
  FOUR,
  FIVE,
  SIX,
  SEVEN,
  EIGHT,
}

enum Status {
  PENDING,
  SUCCESS,
  FAIL,
}

const enum Opcode {
  SKIP,
  VAL,
  ZIPMAP,
  BLOCK_NUMBER,
  SENDER,
  ADD,
  SUB,
  MUL,
  DIV,
  MOD,
  POW,
  MIN,
  MAX,
  REPORT,
  NEVER,
  ALWAYS,
  SATURATING_DIFF,
  UPDATE_BLOCKS_FOR_TIER_RANGE,
  SELECT_LTE,
  REMAINING_UNITS,
  TOTAL_RESERVE_IN,
  LAST_RESERVE_IN,
  LAST_BUY_BLOCK,
  LAST_BUY_UNITS,
  LAST_BUY_PRICE,
}

const saleDeploy = async (
  deployer: SignerWithAddress,
  saleFactory: SaleFactory & Contract,
  config: SaleConfigStruct,
  saleRedeemableERC20Config: SaleRedeemableERC20ConfigStruct,
  ...args
): Promise<Sale & Contract> => {
  const txDeploy = await saleFactory.createChildTyped(
    config,
    saleRedeemableERC20Config,
    ...args
  );

  const sale = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(txDeploy, "NewChild", saleFactory)).child
      ),
      20 // address bytes length
    ),
    (await artifacts.readArtifact("Sale")).abi,
    deployer
  ) as Sale & Contract;

  if (!ethers.utils.isAddress(sale.address)) {
    throw new Error(
      `invalid sale address: ${sale.address} (${sale.address.length} chars)`
    );
  }

  await sale.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  sale.deployTransaction = txDeploy;

  return sale;
};

let reserve: ReserveToken & Contract,
  redeemableERC20FactoryFactory: ContractFactory,
  redeemableERC20Factory: RedeemableERC20Factory & Contract,
  readWriteTierFactory: ContractFactory,
  readWriteTier: ReadWriteTier & Contract,
  saleConstructorConfig: SaleConstructorConfigStruct,
  saleFactoryFactory: ContractFactory,
  saleFactory: SaleFactory & Contract;

describe("Sale", async function () {
  before(async () => {
    reserve = (await Util.basicDeploy("ReserveToken", {})) as ReserveToken &
      Contract;

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
      redeemableERC20Factory: redeemableERC20Factory.address,
    };

    saleFactoryFactory = await ethers.getContractFactory("SaleFactory", {});
    saleFactory = (await saleFactoryFactory.deploy(
      saleConstructorConfig
    )) as SaleFactory & Contract;
    await saleFactory.deployed();
  });

  it("should prevent recipient claiming fees on failed raise, allowing buyers to refund their tokens", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const feeRecipient = signers[2];
    const signer1 = signers[3];

    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const minimumSaleDuration = 30;
    const minimumRaise = ethers.BigNumber.from(
      "100000" + "0".repeat(await reserve.decimals())
    );

    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };

    const staticPrice = ethers.BigNumber.from(
      "10" + "0".repeat(await reserve.decimals())
    );

    const constants = [staticPrice];
    const v10 = op(Opcode.VAL, 0);

    const sources = [concat([v10])];

    const sale = await saleDeploy(
      deployer,
      saleFactory,
      {
        vmStateConfig: {
          sources,
          constants,
          stackLength: 1,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        startBlock,
        cooldownDuration: 1,
        minimumSaleDuration,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
      }
    );

    const fee = ethers.BigNumber.from(
      "1" + "0".repeat(await reserve.decimals())
    );

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    // give signer1 a lot of reserve
    await reserve.transfer(
      signer1.address,
      ethers.BigNumber.from("1000000" + "0".repeat(await reserve.decimals()))
    );

    const desiredUnits = totalTokenSupply.div(10);

    await reserve
      .connect(signer1)
      .approve(sale.address, staticPrice.mul(desiredUnits).add(fee));

    // buy _some_ units; insufficient raise amount
    const txBuy = await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: 1,
      desiredUnits,
      maximumPrice: staticPrice,
    });

    const { receipt } = await Util.getEventArgs(txBuy, "Buy", sale);

    // wait until sale can end
    await Util.createEmptyBlock(
      minimumSaleDuration +
        startBlock -
        (await ethers.provider.getBlockNumber())
    );

    // recipient cannot claim before sale ended with status of success
    await Util.assertError(
      async () =>
        await sale.connect(feeRecipient).claimFees(feeRecipient.address),
      "NOT_SUCCESS",
      "fees were claimed before sale ended with status of success"
    );

    await sale.end();

    const saleStatusFail = await sale.saleStatus();

    assert(
      saleStatusFail === Status.FAIL,
      `wrong status
      expected  ${Status.FAIL}
      got       ${saleStatusFail}`
    );

    // recipient cannot claim after sale ended with status of fail
    await Util.assertError(
      async () =>
        await sale.connect(feeRecipient).claimFees(feeRecipient.address),
      "NOT_SUCCESS",
      "fees were claimed after sale ended with status of fail"
    );

    // signer1 requests refund
    await sale.connect(signer1).refund(receipt);
  });

  it("should allow recipient to claim fees on successful raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const feeRecipient = signers[2];
    const signer1 = signers[3];

    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const minimumSaleDuration = 30;
    const minimumRaise = ethers.BigNumber.from(
      "100000" + "0".repeat(await reserve.decimals())
    );

    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };

    const staticPrice = ethers.BigNumber.from(
      "10" + "0".repeat(await reserve.decimals())
    );

    const constants = [staticPrice];
    const v10 = op(Opcode.VAL, 0);

    const sources = [concat([v10])];

    const sale = await saleDeploy(
      deployer,
      saleFactory,
      {
        vmStateConfig: {
          sources,
          constants,
          stackLength: 1,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        startBlock,
        cooldownDuration: 1,
        minimumSaleDuration,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
      }
    );

    const fee = ethers.BigNumber.from(
      "1" + "0".repeat(await reserve.decimals())
    );

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    // give signer1 a lot of reserve
    await reserve.transfer(
      signer1.address,
      ethers.BigNumber.from("1000000" + "0".repeat(await reserve.decimals()))
    );

    const desiredUnits = totalTokenSupply;

    await reserve
      .connect(signer1)
      .approve(sale.address, staticPrice.mul(desiredUnits).add(fee));

    // buy all units to meet minimum raise amount
    await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: 1,
      desiredUnits,
      maximumPrice: staticPrice,
    });

    // wait until sale can end
    await Util.createEmptyBlock(
      minimumSaleDuration +
        startBlock -
        (await ethers.provider.getBlockNumber())
    );

    // recipient cannot claim before sale ended with status of success
    await Util.assertError(
      async () =>
        await sale.connect(feeRecipient).claimFees(feeRecipient.address),
      "NOT_SUCCESS",
      "fees were claimed before sale ended with status of success"
    );

    await sale.end();

    const saleStatusSuccess = await sale.saleStatus();

    assert(
      saleStatusSuccess === Status.SUCCESS,
      `wrong status
      expected  ${Status.SUCCESS}
      got       ${saleStatusSuccess}`
    );

    await sale.connect(feeRecipient).claimFees(feeRecipient.address);
  });

  it("should have status of Success if minimum raise met", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const feeRecipient = signers[2];
    const signer1 = signers[3];

    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const minimumSaleDuration = 30;
    const minimumRaise = ethers.BigNumber.from(
      "100000" + "0".repeat(await reserve.decimals())
    );

    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };

    const staticPrice = ethers.BigNumber.from(
      "10" + "0".repeat(await reserve.decimals())
    );

    const constants = [staticPrice];
    const v10 = op(Opcode.VAL, 0);

    const sources = [concat([v10])];

    const sale = await saleDeploy(
      deployer,
      saleFactory,
      {
        vmStateConfig: {
          sources,
          constants,
          stackLength: 1,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        startBlock,
        cooldownDuration: 1,
        minimumSaleDuration,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
      }
    );

    const saleToken = await sale.token();
    const saleReserve = await sale.reserve();
    const saleStatusPending = await sale.saleStatus();

    assert(await redeemableERC20Factory.isChild(saleToken));
    assert(saleReserve === reserve.address);
    assert(saleStatusPending === Status.PENDING);

    const fee = ethers.BigNumber.from(
      "1" + "0".repeat(await reserve.decimals())
    );

    const desiredUnits = totalTokenSupply;

    await Util.assertError(
      async () => {
        await sale.connect(signer1).buy({
          feeRecipient: feeRecipient.address,
          fee,
          minimumUnits: 1,
          desiredUnits,
          maximumPrice: staticPrice,
        });
      },
      "NOT_STARTED",
      "bought tokens before sale start"
    );

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    // give signer1 a lot of reserve
    await reserve.transfer(
      signer1.address,
      ethers.BigNumber.from("1000000" + "0".repeat(await reserve.decimals()))
    );

    await reserve
      .connect(signer1)
      .approve(sale.address, staticPrice.mul(desiredUnits).add(fee));

    await Util.assertError(
      async () => {
        await sale.connect(signer1).buy({
          feeRecipient: feeRecipient.address,
          fee,
          minimumUnits: 1,
          desiredUnits: 0,
          maximumPrice: staticPrice,
        });
      },
      "0_DESIRED",
      "bought with 0 desired units"
    );

    await Util.assertError(
      async () => {
        await sale.connect(signer1).buy({
          feeRecipient: feeRecipient.address,
          fee,
          minimumUnits: 2,
          desiredUnits: 1,
          maximumPrice: staticPrice,
        });
      },
      "MINIMUM_OVER_DESIRED",
      "bought with minimum over desired no. units"
    );

    await Util.assertError(
      async () => {
        await sale.connect(signer1).buy({
          feeRecipient: feeRecipient.address,
          fee,
          minimumUnits: 2,
          desiredUnits,
          maximumPrice: staticPrice.sub(1),
        });
      },
      "MAXIMUM_PRICE",
      "bought with max price less than actual price"
    );

    // ACTUALLY buy all units to meet minimum raise amount
    await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: 1,
      desiredUnits,
      maximumPrice: staticPrice,
    });

    await Util.assertError(
      async () => {
        await sale.connect(signer1).buy({
          feeRecipient: feeRecipient.address,
          fee,
          minimumUnits: 1,
          desiredUnits: 1,
          maximumPrice: staticPrice,
        });
      },
      "INSUFFICIENT_STOCK",
      "bought after all units sold"
    );

    // wait until sale can end
    await Util.createEmptyBlock(
      minimumSaleDuration +
        startBlock -
        (await ethers.provider.getBlockNumber())
    );

    await sale.end();

    const saleStatusSuccess = await sale.saleStatus();

    assert(
      saleStatusSuccess === Status.SUCCESS,
      `wrong status
      expected  ${Status.SUCCESS}
      got       ${saleStatusSuccess}`
    );

    await Util.assertError(
      async () => {
        await sale.connect(signer1).buy({
          feeRecipient: feeRecipient.address,
          fee,
          minimumUnits: 1,
          desiredUnits,
          maximumPrice: staticPrice,
        });
      },
      "ENDED",
      "bought after sale ended"
    );
  });

  it("should have status of Fail if minimum raise not met", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];

    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const minimumSaleDuration = 30;
    const minimumRaise = ethers.BigNumber.from(
      "100" + "0".repeat(await reserve.decimals())
    );

    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: Util.zeroAddress,
      initialSupply: totalTokenSupply,
    };

    const staticPrice = ethers.BigNumber.from(
      "10" + "0".repeat(await reserve.decimals())
    );

    const constants = [staticPrice];
    const v10 = op(Opcode.VAL, 0);

    const sources = [concat([v10])];

    const sale = await saleDeploy(
      deployer,
      saleFactory,
      {
        vmStateConfig: {
          sources,
          constants,
          stackLength: 1,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserve.address,
        startBlock,
        cooldownDuration: 1,
        minimumSaleDuration,
        minimumRaise,
        dustSize: 0,
      },
      {
        erc20Config: redeemableERC20Config,
        tier: readWriteTier.address,
        minimumTier: Tier.ZERO,
      }
    );

    const saleToken = await sale.token();
    const saleReserve = await sale.reserve();
    const saleStatusPending = await sale.saleStatus();

    assert(await redeemableERC20Factory.isChild(saleToken));
    assert(saleReserve === reserve.address);
    assert(saleStatusPending === Status.PENDING);

    // wait until sale can end
    await Util.createEmptyBlock(
      minimumSaleDuration +
        startBlock -
        (await ethers.provider.getBlockNumber())
    );

    await sale.end();

    const saleStatusFail = await sale.saleStatus();

    assert(
      saleStatusFail === Status.FAIL,
      `wrong status
      expected  ${Status.FAIL}
      got       ${saleStatusFail}`
    );
  });
});
