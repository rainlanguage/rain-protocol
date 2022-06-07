import * as Util from "../../../utils";
import { assert } from "chai";
import { ethers } from "hardhat";
import type { ReserveToken } from "../../../typechain/ReserveToken";
import type {
  DepositEvent,
  RedeemableERC20ClaimEscrow,
  UndepositEvent,
  WithdrawEvent,
} from "../../../typechain/RedeemableERC20ClaimEscrow";
import type { RedeemableERC20 } from "../../../typechain/RedeemableERC20";
import type { RedeemableERC20ClaimEscrowWrapper } from "../../../typechain/RedeemableERC20ClaimEscrowWrapper";
import type { ReadWriteTier } from "../../../typechain/ReadWriteTier";
import type { Contract } from "ethers";
import { getEventArgs } from "../../../utils";
import { getAddress } from "ethers/lib/utils";
import { } from "../../../typechain/SaleFactory";
import { MockISale } from "../../../typechain/MockISale";
import { RedeemableERC20Factory } from "../../../typechain/RedeemableERC20Factory";
import { deployGlobals } from "../../../utils/deploy/escrow";
import { Status } from "../../../utils/types/sale";

let claim: RedeemableERC20ClaimEscrow & Contract,
  claimWrapper: RedeemableERC20ClaimEscrowWrapper & Contract,
  reserve: ReserveToken & Contract,
  redeemableERC20Factory: RedeemableERC20Factory & Contract,
  readWriteTier: ReadWriteTier & Contract;

describe("RedeemableERC20ClaimEscrow Withdraw test", async function () {
  before(async () => {
    ({ claim, claimWrapper, readWriteTier } = await deployGlobals());
  });

  beforeEach(async () => {
    // some other token to put into the escrow
    reserve = (await Util.basicDeploy("ReserveToken", {})) as ReserveToken &
      Contract;
    const redeemableERC20FactoryFactory = await ethers.getContractFactory(
      "RedeemableERC20Factory",
      {}
    );
    redeemableERC20Factory =
      (await redeemableERC20FactoryFactory.deploy()) as RedeemableERC20Factory &
      Contract;
    await redeemableERC20Factory.deployed();
  });

  it("should allow depositing redeemable tokens on failed raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const alice = signers[1];
    const deployer = signers[3];

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
    await sale.setToken(redeemableERC20.address);

    const desiredUnitsAlice = totalTokenSupply;

    await sale.setSaleStatus(Status.ACTIVE);

    const saleStatusActive = await sale.saleStatus();

    assert(
      saleStatusActive === Status.ACTIVE,
      `wrong status
        expected  ${Status.ACTIVE}
        got       ${saleStatusActive}`
    );

    await redeemableERC20
      .connect(deployer)
      .transfer(alice.address, desiredUnitsAlice.div(10));

    // deposit claimable tokens
    const depositAmount0 = ethers.BigNumber.from(
      "100" + "0".repeat(await reserve.decimals())
    );

    await reserve.approve(claim.address, depositAmount0);

    const txDepositPending0 = await claim.depositPending(
      sale.address,
      reserve.address,
      depositAmount0
    );

    await sale.setSaleStatus(Status.FAIL);

    await claim.sweepPending(sale.address, reserve.address, signers[0].address);

    const supply = await redeemableERC20.totalSupply();

    const { amount: deposited0 } = await Util.getEventArgs(
      txDepositPending0,
      "PendingDeposit",
      claim
    );

    assert(
      deposited0.eq(depositAmount0),
      "actual tokens deposited and registered amount do not match"
    );

    const depositAmount1 = ethers.BigNumber.from(
      "100" + "0".repeat(await reserve.decimals())
    );

    await reserve.approve(claim.address, depositAmount1);

    // can deposit and undeposit when fail
    await claim.deposit(sale.address, reserve.address, depositAmount1);

    await claim.undeposit(
      sale.address,
      reserve.address,
      supply,
      depositAmount1
    );
  });

  it("should allow depositing redeemable tokens when not failed raise (during trading or successfully closed)", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const alice = signers[1];
    const deployer = signers[3];

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
    await sale.setToken(redeemableERC20.address);

    const desiredUnitsAlice = totalTokenSupply;

    const aliceReserveBalance = await reserve.balanceOf(alice.address);

    await sale.setSaleStatus(Status.ACTIVE);
    await redeemableERC20
      .connect(deployer)
      .transfer(alice.address, desiredUnitsAlice.div(10));
    await reserve.connect(alice).approve(sale.address, aliceReserveBalance);

    const saleStatusActive = await sale.saleStatus();

    assert(
      saleStatusActive === Status.ACTIVE,
      `wrong status
        expected  ${Status.ACTIVE}
        got       ${saleStatusActive}`
    );

    // deposit some claimable tokens
    const depositAmount0 = ethers.BigNumber.from(
      "100" + "0".repeat(await reserve.decimals())
    );

    await reserve.approve(claim.address, depositAmount0);

    const txDepositPending0 = await claim.depositPending(
      sale.address,
      reserve.address,
      depositAmount0
    );

    const { amount: deposited0 } = await Util.getEventArgs(
      txDepositPending0,
      "PendingDeposit",
      claim
    );

    assert(
      deposited0.eq(depositAmount0),
      "actual tokens deposited and registered amount do not match (0)"
    );

    await redeemableERC20
      .connect(deployer)
      .transfer(alice.address, desiredUnitsAlice.mul(9).div(10));
    await sale.setSaleStatus(Status.SUCCESS);

    const totalDepositedActual0 = deposited0;
    const totalDepositedExpected0 = depositAmount0;

    assert(
      totalDepositedActual0.eq(totalDepositedExpected0),
      `actual tokens deposited by sender and registered amount do not match (1)
      expected  ${totalDepositedExpected0}
      got       ${totalDepositedActual0}`
    );

    // deposit some claimable tokens
    const depositAmount1 = ethers.BigNumber.from(
      "100" + "0".repeat(await reserve.decimals())
    );

    await reserve.approve(claim.address, depositAmount1);

    const txSweep0 = await claim.sweepPending(
      sale.address,
      reserve.address,
      signers[0].address
    );

    const {
      sender,
      depositor,
      sale: saleAddress,
      redeemable,
      token,
      amount,
    } = await Util.getEventArgs(txSweep0, "Sweep", claim);

    assert(sender === signers[0].address, "wrong sender");
    assert(depositor === signers[0].address, "wrong depositor");
    assert(saleAddress === getAddress(sale.address), "wrong sale address");
    assert(
      redeemable === getAddress(redeemableERC20.address),
      "wrong redeemable address"
    );
    assert(token === getAddress(reserve.address), "wrong token address");
    assert(amount.eq(totalDepositedExpected0), "wrong amount");

    const txDeposit0 = await claim.deposit(
      sale.address,
      reserve.address,
      depositAmount1
    );

    const eventDeposit0 = (await Util.getEventArgs(
      txDeposit0,
      "Deposit",
      claim
    )) as DepositEvent["args"];

    assert(eventDeposit0.depositor === signers[0].address, "wrong depositor");
    assert(eventDeposit0.sale === getAddress(sale.address), "wrong sale");
    assert(
      eventDeposit0.redeemable === getAddress(redeemableERC20.address),
      "wrong redeemable address"
    );
    assert(
      eventDeposit0.token === getAddress(reserve.address),
      "wrong token address"
    );
    assert(
      eventDeposit0.supply.eq(await redeemableERC20.totalSupply()),
      "wrong supply"
    );
    assert(eventDeposit0.amount.eq(depositAmount1), "wrong amount");

    const totalDepositedActual1 = eventDeposit0.amount.add(deposited0);
    const totalDepositedExpected1 = depositAmount1.add(depositAmount0);

    assert(
      totalDepositedActual1.eq(totalDepositedExpected1),
      `actual tokens deposited by sender and registered amount do not match (2)
      expected  ${totalDepositedExpected1} = ${depositAmount1} + ${depositAmount0}
      got       ${totalDepositedActual1}`
    );
  });
});
