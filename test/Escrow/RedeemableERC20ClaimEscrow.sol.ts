import * as Util from "../Util";
import chai from "chai";
import { ethers } from "hardhat";
import { deployGlobals } from "./EscrowUtil";
import type { ReserveToken } from "../../typechain/ReserveToken";
import type {
  DepositEvent,
  RedeemableERC20ClaimEscrow,
  UndepositEvent,
  WithdrawEvent,
} from "../../typechain/RedeemableERC20ClaimEscrow";
import type { RedeemableERC20ClaimEscrowWrapper } from "../../typechain/RedeemableERC20ClaimEscrowWrapper";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import type { Contract } from "ethers";
import { getEventArgs, op } from "../Util";
import { concat, getAddress } from "ethers/lib/utils";
import { SaleFactory } from "../../typechain/SaleFactory";
import {
  afterBlockNumberConfig,
  Opcode,
  saleDeploy,
  Status,
} from "../Sale/SaleUtil";

const { assert } = chai;

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

let claim: RedeemableERC20ClaimEscrow & Contract,
  claimWrapper: RedeemableERC20ClaimEscrowWrapper & Contract,
  saleFactory: SaleFactory & Contract,
  readWriteTier: ReadWriteTier & Contract,
  reserve: ReserveToken & Contract;

describe("RedeemableERC20ClaimEscrow", async function () {
  before(async () => {
    ({ claim, claimWrapper, saleFactory, readWriteTier } =
      await deployGlobals());
  });

  beforeEach(async () => {
    // some other token to put into the escrow
    reserve = (await Util.basicDeploy("ReserveToken", {})) as ReserveToken &
      Contract;
  });

  it("if alice withdraws then burns then bob withdraws, bob does not receive more than his pro-rata share from deposit time due to the subsequent supply change", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[1];
    const recipient = signers[2];
    const feeRecipient = signers[3];
    const alice = signers[4];
    const bob = signers[5];

    const startBlock = await ethers.provider.getBlockNumber();

    const saleDuration = 30;
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

    const [sale, redeemableERC20] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleDuration),
        calculatePriceStateConfig: {
          sources,
          constants,
        },
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
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    const desiredUnitsAlice = totalTokenSupply.div(2);
    const desiredUnitsBob = totalTokenSupply.div(2);
    const costAlice = staticPrice.mul(desiredUnitsAlice).div(Util.ONE);
    const costBob = staticPrice.mul(desiredUnitsBob).div(Util.ONE);

    // give alice reserve to cover cost + (fee * 2)
    await reserve.transfer(alice.address, costAlice.add(fee.mul(2)));
    // give bob reserve to cover cost + (fee * 2)
    await reserve.transfer(bob.address, costBob.add(fee.mul(2)));

    const aliceReserveBalance = await reserve.balanceOf(alice.address);
    const bobReserveBalance = await reserve.balanceOf(bob.address);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.start();

    await reserve.connect(alice).approve(sale.address, aliceReserveBalance);
    await reserve.connect(bob).approve(sale.address, bobReserveBalance);

    // alice buys 1/4 available units
    await sale.connect(alice).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnitsAlice.div(2),
      desiredUnits: desiredUnitsAlice.div(2),
      maximumPrice: staticPrice,
    });
    // bob buys 1/4 available units
    await sale.connect(bob).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnitsBob.div(2),
      desiredUnits: desiredUnitsBob.div(2),
      maximumPrice: staticPrice,
    });

    const saleStatusActive = await sale.saleStatus();

    assert(
      saleStatusActive === Status.ACTIVE,
      `wrong status
        expected  ${Status.ACTIVE}
        got       ${saleStatusActive}`
    );

    // deposit claimable tokens
    const depositAmount0 = ethers.BigNumber.from(
      "100" + "0".repeat(await reserve.decimals())
    );

    // give signers claimable tokens to deposit
    await reserve.transfer(alice.address, depositAmount0);
    await reserve.transfer(bob.address, depositAmount0);

    await reserve.connect(alice).approve(claim.address, depositAmount0);
    await reserve.connect(bob).approve(claim.address, depositAmount0);

    await claim
      .connect(alice)
      .depositPending(sale.address, reserve.address, depositAmount0);
    await claim
      .connect(bob)
      .depositPending(sale.address, reserve.address, depositAmount0);

    // alice buys 1/4 available units
    await sale.connect(alice).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnitsAlice.div(2),
      desiredUnits: desiredUnitsAlice.div(2),
      maximumPrice: staticPrice,
    });
    // bob buys 1/4 available units
    await sale.connect(bob).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnitsBob.div(2),
      desiredUnits: desiredUnitsBob.div(2),
      maximumPrice: staticPrice,
    });

    const saleStatusSuccess = await sale.saleStatus();

    assert(
      saleStatusSuccess === Status.SUCCESS,
      `wrong status
        expected  ${Status.SUCCESS}
        got       ${saleStatusSuccess}`
    );

    const depositAlice = await claim.sweepPending(
      sale.address,
      reserve.address,
      alice.address
    );
    const depositBob = await claim.sweepPending(
      sale.address,
      reserve.address,
      bob.address
    );

    const { amount: aliceDeposited } = (await getEventArgs(
      depositAlice,
      "Deposit",
      claim
    )) as DepositEvent["args"];
    const { supply: supplyFinal, amount: bobDeposited } = (await getEventArgs(
      depositBob,
      "Deposit",
      claim
    )) as DepositEvent["args"];

    const totalDeposited = aliceDeposited.add(bobDeposited);

    const supplyRedeemableBeforeBurn = await redeemableERC20.totalSupply();

    assert(
      supplyRedeemableBeforeBurn.eq(supplyFinal),
      "registered RedeemableERC20 total supply was wrong"
    );

    // alice withdraws tokens
    await claim
      .connect(alice)
      .withdraw(sale.address, reserve.address, supplyFinal);

    const aliceRedeemableERC20TokenBalance = await redeemableERC20.balanceOf(
      alice.address
    );

    // alice burns her RedeemableERC20 tokens
    await redeemableERC20.connect(alice).burn(aliceRedeemableERC20TokenBalance);

    const supplyRedeemableAfterBurn = await redeemableERC20.totalSupply();

    // withdrawing against new RedeemableERC20 supply, rather than registered amount, will revert
    await Util.assertError(
      async () =>
        await claim
          .connect(bob)
          .withdraw(sale.address, reserve.address, supplyRedeemableAfterBurn),
      "ZERO_WITHDRAW",
      "wrongly withdrew against unregistered RedeemableERC20 total supply amount"
    );

    const bobWithdrawalAmountUsingNewSupply = totalDeposited
      .mul(await redeemableERC20.balanceOf(bob.address))
      .mul(Util.ONE)
      .div(supplyRedeemableAfterBurn)
      .div(Util.ONE);
    const bobWithdrawalAmountExpected = totalDeposited
      .mul(await redeemableERC20.balanceOf(bob.address))
      .mul(Util.ONE)
      .div(supplyFinal)
      .div(Util.ONE);

    // bob withdraws tokens
    const txWithdrawBob = await claim
      .connect(bob)
      .withdraw(sale.address, reserve.address, supplyFinal);

    const { amount: amountWithdrawnBob } = (await Util.getEventArgs(
      txWithdrawBob,
      "Withdraw",
      claim
    )) as WithdrawEvent["args"];

    assert(
      !amountWithdrawnBob.eq(bobWithdrawalAmountUsingNewSupply),
      "bob pro-rata share changed after alice burned her RedeemableERC20 tokens"
    );
    assert(
      amountWithdrawnBob.eq(bobWithdrawalAmountExpected),
      `bob withdrew wrong amount
      expected  ${bobWithdrawalAmountExpected}
      got       ${amountWithdrawnBob}`
    );
  });

  it("should ensure different depositors can both undeposit independently", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const deployer = signers[1];
    const recipient = signers[2];
    const alice = signers[3];
    const bob = signers[4];
    const feeRecipient = signers[5];

    const startBlock = await ethers.provider.getBlockNumber();

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

    const [sale, redeemableERC20] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
        calculatePriceStateConfig: {
          sources,
          constants,
        },
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
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    const desiredUnitsAlice = totalTokenSupply.div(2);
    const desiredUnitsBob = totalTokenSupply.div(2);
    const costAlice = staticPrice.mul(desiredUnitsAlice).div(Util.ONE);
    const costBob = staticPrice.mul(desiredUnitsBob).div(Util.ONE);

    // give alice reserve to cover cost + (fee * 2)
    await reserve.transfer(alice.address, costAlice.add(fee.mul(2)));
    // give bob reserve to cover cost + (fee * 2)
    await reserve.transfer(bob.address, costBob.add(fee.mul(2)));

    const aliceReserveBalance = await reserve.balanceOf(alice.address);
    const bobReserveBalance = await reserve.balanceOf(bob.address);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.start();

    await reserve.connect(alice).approve(sale.address, aliceReserveBalance);
    await reserve.connect(bob).approve(sale.address, bobReserveBalance);

    // alice buys 1/4 available units
    await sale.connect(alice).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnitsAlice.div(2),
      desiredUnits: desiredUnitsAlice.div(2),
      maximumPrice: staticPrice,
    });
    // bob buys 1/4 available units
    await sale.connect(bob).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnitsBob.div(2),
      desiredUnits: desiredUnitsBob.div(2),
      maximumPrice: staticPrice,
    });

    const saleStatusActive = await sale.saleStatus();

    assert(
      saleStatusActive === Status.ACTIVE,
      `wrong status
        expected  ${Status.ACTIVE}
        got       ${saleStatusActive}`
    );

    // deposit claimable tokens
    const depositAmount0 = ethers.BigNumber.from(
      "100" + "0".repeat(await reserve.decimals())
    );

    // give signers claimable tokens to deposit
    await reserve.transfer(alice.address, depositAmount0);
    await reserve.transfer(bob.address, depositAmount0);

    await reserve.connect(alice).approve(claim.address, depositAmount0);
    await reserve.connect(bob).approve(claim.address, depositAmount0);

    const txDepositPending0 = await claim
      .connect(alice)
      .depositPending(sale.address, reserve.address, depositAmount0);
    const txDepositPending1 = await claim
      .connect(bob)
      .depositPending(sale.address, reserve.address, depositAmount0);

    // wait until sale can end
    await Util.createEmptyBlock(
      saleTimeout + startBlock - (await ethers.provider.getBlockNumber())
    );

    const canEnd = await sale.canEnd();
    assert(canEnd);

    await sale.end();

    const saleStatusFail = await sale.saleStatus();

    assert(
      saleStatusFail === Status.FAIL,
      `wrong status in getter
      expected  ${Status.FAIL}
      got       ${saleStatusFail}`
    );

    await claim.sweepPending(sale.address, reserve.address, alice.address);
    const deposit1 = await claim.sweepPending(
      sale.address,
      reserve.address,
      bob.address
    );

    const { supply: supplyFinal } = await getEventArgs(
      deposit1,
      "Deposit",
      claim
    );

    const { amount: deposited0 } = await Util.getEventArgs(
      txDepositPending0,
      "PendingDeposit",
      claim
    );
    const { amount: deposited1 } = await Util.getEventArgs(
      txDepositPending1,
      "PendingDeposit",
      claim
    );

    assert(
      deposited0.eq(depositAmount0),
      "actual tokens signer1 deposited and registered amount do not match"
    );
    assert(
      deposited1.eq(depositAmount0),
      "actual tokens signer2 deposited and registered amount do not match"
    );

    // undeposit claimable tokens
    const undepositTx0 = await claim
      .connect(alice)
      .undeposit(sale.address, reserve.address, supplyFinal, depositAmount0);
    const undepositTx1 = await claim
      .connect(bob)
      .undeposit(sale.address, reserve.address, supplyFinal, depositAmount0);

    // Undeposit events
    const undepositEvent0 = (await Util.getEventArgs(
      undepositTx0,
      "Undeposit",
      claim
    )) as UndepositEvent["args"];
    const undepositEvent1 = (await Util.getEventArgs(
      undepositTx1,
      "Undeposit",
      claim
    )) as UndepositEvent["args"];

    // undepositEvent0
    assert(undepositEvent0.sender === alice.address, "wrong sender");
    assert(undepositEvent0.sale === getAddress(sale.address), "wrong sale");
    assert(
      undepositEvent0.redeemable === getAddress(redeemableERC20.address),
      "wrong redeemable"
    );
    assert(
      undepositEvent0.token === getAddress(reserve.address),
      "wrong token"
    );
    assert(undepositEvent0.supply.eq(supplyFinal), "wrong supply");
    assert(undepositEvent0.amount.eq(depositAmount0), "wrong amount");

    // undepositEvent1
    assert(undepositEvent1.sender === bob.address, "wrong sender");
    assert(undepositEvent1.sale === getAddress(sale.address), "wrong sale");
    assert(
      undepositEvent1.redeemable === getAddress(redeemableERC20.address),
      "wrong redeemable"
    );
    assert(
      undepositEvent1.token === getAddress(reserve.address),
      "wrong token"
    );
    assert(undepositEvent1.supply.eq(supplyFinal), "wrong supply");
    assert(undepositEvent1.amount.eq(depositAmount0), "wrong amount");
  });

  it("should distribute correct withdrawal proportion if RedeemableERC20 tokens are burned", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const alice = signers[1];
    const bob = signers[2];
    const deployer = signers[3];
    const recipient = signers[4];
    const feeRecipient = signers[5];

    const startBlock = await ethers.provider.getBlockNumber();

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

    const [sale, redeemableERC20] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
        calculatePriceStateConfig: {
          sources,
          constants,
        },
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
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    const desiredUnitsAlice = totalTokenSupply.div(2);
    const desiredUnitsBob = totalTokenSupply.div(2);
    const costAlice = staticPrice.mul(desiredUnitsAlice).div(Util.ONE);
    const costBob = staticPrice.mul(desiredUnitsBob).div(Util.ONE);

    // give alice reserve to cover cost + fee
    await reserve.transfer(alice.address, costAlice.add(fee));
    // give bob reserve to cover cost + fee
    await reserve.transfer(bob.address, costBob.add(fee));

    const aliceReserveBalance = await reserve.balanceOf(alice.address);
    const bobReserveBalance = await reserve.balanceOf(bob.address);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.start();

    await reserve.connect(alice).approve(sale.address, aliceReserveBalance);
    await reserve.connect(bob).approve(sale.address, bobReserveBalance);

    // alice buys 1/2 available units
    await sale.connect(alice).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnitsAlice,
      desiredUnits: desiredUnitsAlice,
      maximumPrice: staticPrice,
    });

    const saleStatusActive = await sale.saleStatus();

    assert(
      saleStatusActive === Status.ACTIVE,
      `wrong status
        expected  ${Status.ACTIVE}
        got       ${saleStatusActive}`
    );

    // bob buys 1/2 available units
    await sale.connect(bob).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnitsBob,
      desiredUnits: desiredUnitsBob,
      maximumPrice: staticPrice,
    });

    const saleStatusSuccess = await sale.saleStatus();

    assert(
      saleStatusSuccess === Status.SUCCESS,
      `wrong status
        expected  ${Status.SUCCESS}
        got       ${saleStatusSuccess}`
    );

    // deposit claimable tokens
    const depositAmount = ethers.BigNumber.from(
      "100" + "0".repeat(await reserve.decimals())
    );

    await reserve.approve(claim.address, depositAmount);
    // creator deposits claimable tokens
    const txDeposit0 = await claim.deposit(
      sale.address,
      reserve.address,
      depositAmount
    );

    const supply0 = (await getEventArgs(txDeposit0, "Deposit", claim)).supply;

    // calculate real RedeemableERC20 proportions
    const signer1Prop = (await redeemableERC20.balanceOf(alice.address))
      .mul(Util.ONE)
      .div(await redeemableERC20.totalSupply());

    // signer1 should withdraw roughly 50% of claimable tokens in escrow
    await claim.connect(alice).withdraw(sale.address, reserve.address, supply0);

    const expectedSigner1Withdrawal0 = depositAmount
      .mul(signer1Prop)
      .div(Util.ONE);

    const actualSigner1Withdrawal0 = await reserve.balanceOf(alice.address);

    assert(
      expectedSigner1Withdrawal0.eq(actualSigner1Withdrawal0),
      `wrong amount of claimable tokens withdrawn (first withdrawal)
      signer1Prop     ${signer1Prop.toString().slice(0, 2)}.${signer1Prop
        .toString()
        .slice(3)}%
      expected        ${expectedSigner1Withdrawal0}
      got             ${actualSigner1Withdrawal0}`
    );

    // signer2 burns their RedeemableERC20 token balance for some reserve
    reserve.transfer(redeemableERC20.address, "1" + Util.sixZeros);
    await redeemableERC20
      .connect(bob)
      .redeem([reserve.address], await redeemableERC20.balanceOf(bob.address));

    // more claimable tokens are deposited by creator
    await reserve.approve(claim.address, depositAmount);
    const deposit1 = await claim.deposit(
      sale.address,
      reserve.address,
      depositAmount
    );

    const supply1 = (await getEventArgs(deposit1, "Deposit", claim)).supply;

    // recalculate real RedeemableERC20 proportions
    const signer1PropAfterBurn = (
      await redeemableERC20.balanceOf(alice.address)
    )
      .mul(Util.ONE)
      .div(await redeemableERC20.totalSupply());

    // signer1 2nd withdraw
    await claim.connect(alice).withdraw(sale.address, reserve.address, supply1);

    const expectedSigner1Withdrawal1 = depositAmount
      .mul(signer1PropAfterBurn)
      .div(Util.ONE);

    const actualSigner1Withdrawal1 = (
      await reserve.balanceOf(alice.address)
    ).sub(actualSigner1Withdrawal0);

    assert(
      expectedSigner1Withdrawal1.eq(actualSigner1Withdrawal1),
      `wrong amount of claimable tokens withdrawn (second withdrawal)
      signer1Prop     ${signer1Prop.toString().slice(0, 2)}.${signer1Prop
        .toString()
        .slice(3)}%
      expected        ${expectedSigner1Withdrawal1}
      got             ${actualSigner1Withdrawal1}`
    );
  });

  it("should support multiple withdrawals per sender if more claimable tokens are deposited after a withdrawal", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const alice = signers[1];
    const bob = signers[2];
    const deployer = signers[3];
    const recipient = signers[4];
    const feeRecipient = signers[5];

    const startBlock = await ethers.provider.getBlockNumber();

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

    const [sale, redeemableERC20] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
        calculatePriceStateConfig: {
          sources,
          constants,
        },
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
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    const desiredUnitsAlice = totalTokenSupply.div(4); // 25%
    const desiredUnitsBob = totalTokenSupply.mul(3).div(4); // 75%
    const costAlice = staticPrice.mul(desiredUnitsAlice).div(Util.ONE);
    const costBob = staticPrice.mul(desiredUnitsBob).div(Util.ONE);

    // give alice reserve to cover cost + fee
    await reserve.transfer(alice.address, costAlice.add(fee));
    // give bob reserve to cover cost + fee
    await reserve.transfer(bob.address, costBob.add(fee));

    const aliceReserveBalance = await reserve.balanceOf(alice.address);
    const bobReserveBalance = await reserve.balanceOf(bob.address);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.start();

    await reserve.connect(alice).approve(sale.address, aliceReserveBalance);
    await reserve.connect(bob).approve(sale.address, bobReserveBalance);

    // alice buys 1/4 available units
    await sale.connect(alice).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnitsAlice,
      desiredUnits: desiredUnitsAlice,
      maximumPrice: staticPrice,
    });

    const saleStatusActive = await sale.saleStatus();

    assert(
      saleStatusActive === Status.ACTIVE,
      `wrong status
        expected  ${Status.ACTIVE}
        got       ${saleStatusActive}`
    );

    // bob buys 3/4 available units
    await sale.connect(bob).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnitsBob,
      desiredUnits: desiredUnitsBob,
      maximumPrice: staticPrice,
    });

    const saleStatusSuccess = await sale.saleStatus();

    assert(
      saleStatusSuccess === Status.SUCCESS,
      `wrong status
        expected  ${Status.SUCCESS}
        got       ${saleStatusSuccess}`
    );

    // deposit claimable tokens
    const depositAmount = ethers.BigNumber.from(
      "100" + "0".repeat(await reserve.decimals())
    );

    await reserve.approve(claimWrapper.address, depositAmount);
    // creator deposits claimable tokens
    const txDeposit0 = await claimWrapper.deposit(
      sale.address,
      reserve.address,
      depositAmount
    );
    const supply0 = (await getEventArgs(txDeposit0, "Deposit", claimWrapper))
      .supply;

    // calculate real RedeemableERC20 proportions
    const signer1Prop = (await redeemableERC20.balanceOf(alice.address))
      .mul(Util.ONE)
      .div(await redeemableERC20.totalSupply());

    // signer1 should withdraw roughly 25% of claimable tokens in escrow
    await claimWrapper
      .connect(alice)
      .withdraw(sale.address, reserve.address, supply0);

    const expectedSigner1Withdrawal0 = depositAmount
      .mul(signer1Prop)
      .div(Util.ONE);

    const actualSigner1Withdrawal0 = await reserve.balanceOf(alice.address);

    assert(
      expectedSigner1Withdrawal0.eq(actualSigner1Withdrawal0),
      `wrong amount of claimable tokens withdrawn (first withdrawal)
      signer1Prop     ${signer1Prop.toString().slice(0, 2)}.${signer1Prop
        .toString()
        .slice(3)}%
      expected        ${expectedSigner1Withdrawal0}
      got             ${actualSigner1Withdrawal0}`
    );

    // signer1 2nd withdraw
    // instantly withdrawing again is an error.
    await Util.assertError(
      async () =>
        await claimWrapper
          .connect(alice)
          .withdraw(sale.address, reserve.address, supply0),
      "ZERO_WITHDRAW",
      "Failed to error on zero withdraw"
    );

    // more claimable tokens are deposited by creator
    await reserve.approve(claimWrapper.address, depositAmount);
    const deposit1 = await claimWrapper.deposit(
      sale.address,
      reserve.address,
      depositAmount
    );
    const supply1 = (await getEventArgs(deposit1, "Deposit", claimWrapper))
      .supply;

    const claimableTokensInEscrowDeposit1 = await claimWrapper.getTotalDeposits(
      sale.address,
      reserve.address,
      await redeemableERC20.totalSupply()
    );

    // signer1 3rd withdraw
    await claimWrapper
      .connect(alice)
      .withdraw(sale.address, reserve.address, supply1);

    const expectedSigner1Withdrawal1 = depositAmount
      .mul(signer1Prop)
      .div(Util.ONE);

    const actualSigner1Withdrawal1 = (
      await reserve.balanceOf(alice.address)
    ).sub(actualSigner1Withdrawal0);

    assert(
      expectedSigner1Withdrawal1.eq(actualSigner1Withdrawal1),
      `wrong amount of claimable tokens withdrawn (third withdrawal)
      signer1Prop     ${signer1Prop.toString().slice(0, 2)}.${signer1Prop
        .toString()
        .slice(3)}%
      totalDeposits   ${claimableTokensInEscrowDeposit1}
      expected        ${expectedSigner1Withdrawal1}
      got             ${actualSigner1Withdrawal1}`
    );
  });

  it("should allocate token withdrawals pro rata (sender's proportion of RedeemableERC20 total supply)", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const alice = signers[1];
    const bob = signers[2];
    const deployer = signers[3];
    const recipient = signers[4];
    const feeRecipient = signers[5];

    const startBlock = await ethers.provider.getBlockNumber();

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

    const [sale, redeemableERC20] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
        calculatePriceStateConfig: {
          sources,
          constants,
        },
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
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    const desiredUnitsAlice = totalTokenSupply.div(4); // 25%
    const desiredUnitsBob = totalTokenSupply.mul(3).div(4); // 75%
    const costAlice = staticPrice.mul(desiredUnitsAlice).div(Util.ONE);
    const costBob = staticPrice.mul(desiredUnitsBob).div(Util.ONE);

    // give alice reserve to cover cost + fee
    await reserve.transfer(alice.address, costAlice.add(fee));
    // give bob reserve to cover cost + fee
    await reserve.transfer(bob.address, costBob.add(fee));

    const aliceReserveBalance = await reserve.balanceOf(alice.address);
    const bobReserveBalance = await reserve.balanceOf(bob.address);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.start();

    await reserve.connect(alice).approve(sale.address, aliceReserveBalance);
    await reserve.connect(bob).approve(sale.address, bobReserveBalance);

    // alice buys 1/4 available units
    await sale.connect(alice).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnitsAlice,
      desiredUnits: desiredUnitsAlice,
      maximumPrice: staticPrice,
    });

    const saleStatusActive = await sale.saleStatus();

    assert(
      saleStatusActive === Status.ACTIVE,
      `wrong status
        expected  ${Status.ACTIVE}
        got       ${saleStatusActive}`
    );

    // bob buys 3/4 available units
    await sale.connect(bob).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnitsBob,
      desiredUnits: desiredUnitsBob,
      maximumPrice: staticPrice,
    });

    const saleStatusSuccess = await sale.saleStatus();

    assert(
      saleStatusSuccess === Status.SUCCESS,
      `wrong status
        expected  ${Status.SUCCESS}
        got       ${saleStatusSuccess}`
    );

    // deposit claimable tokens
    const depositAmount = ethers.BigNumber.from(
      "100" + "0".repeat(await reserve.decimals())
    );

    await reserve.approve(claim.address, depositAmount);

    // creator deposits claimable tokens
    const txDeposit = await claim.deposit(
      sale.address,
      reserve.address,
      depositAmount
    );

    const supply = (await getEventArgs(txDeposit, "Deposit", claim)).supply;

    const signer1Prop = (await redeemableERC20.balanceOf(alice.address))
      .mul(Util.ONE)
      .div(await redeemableERC20.totalSupply());

    const expectedWithdrawal = depositAmount.mul(signer1Prop).div(Util.ONE);

    // signer1 should withdraw roughly 25% of claimable tokens in escrow
    await claim.connect(alice).withdraw(sale.address, reserve.address, supply);

    const actualWithdrawal = await reserve.balanceOf(alice.address);

    assert(
      expectedWithdrawal.eq(actualWithdrawal),
      `wrong amount of claimable tokens withdrawn
      signer1Prop     ${signer1Prop.toString().slice(0, 2)}.${signer1Prop
        .toString()
        .slice(3)}%
      expected        ${expectedWithdrawal}
      got             ${actualWithdrawal}`
    );

    // signer2 should withdraw remaining claimable tokens in escrow
    await claim.connect(bob).withdraw(sale.address, reserve.address, supply);

    const finalEscrowClaimableTokenBalance = await reserve.balanceOf(
      claim.address
    );

    assert(
      finalEscrowClaimableTokenBalance.eq(0) ||
        finalEscrowClaimableTokenBalance.eq(1), // rounding error might leave 1 token
      `wrong final claimable tokens in escrow, got ${finalEscrowClaimableTokenBalance}`
    );
  });

  it("should allow withdrawing redeemable tokens on successful raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const alice = signers[1];
    const deployer = signers[3];
    const recipient = signers[4];
    const feeRecipient = signers[5];

    const startBlock = await ethers.provider.getBlockNumber();

    const saleDuration = 30;
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
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleDuration),
        calculatePriceStateConfig: {
          sources,
          constants,
        },
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
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    const desiredUnitsAlice = totalTokenSupply;
    const costAlice = staticPrice.mul(desiredUnitsAlice).div(Util.ONE);

    // give alice reserve to cover cost + (fee * 2)
    await reserve.transfer(alice.address, costAlice.add(fee.mul(2)));

    const aliceReserveBalance = await reserve.balanceOf(alice.address);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.start();

    await reserve.connect(alice).approve(sale.address, aliceReserveBalance);

    // alice buys some units
    await sale.connect(alice).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnitsAlice.div(10),
      desiredUnits: desiredUnitsAlice.div(10),
      maximumPrice: staticPrice,
    });

    const saleStatusActive = await sale.saleStatus();

    assert(
      saleStatusActive === Status.ACTIVE,
      `wrong status
        expected  ${Status.ACTIVE}
        got       ${saleStatusActive}`
    );

    // deposit claimable tokens
    const depositAmount = ethers.BigNumber.from(
      "100" + "0".repeat(await reserve.decimals())
    );

    await reserve.approve(claim.address, depositAmount);

    await claim.depositPending(sale.address, reserve.address, depositAmount);

    const preSupply = await reserve.totalSupply();

    // prevent withdraw until status Success
    await Util.assertError(
      async () =>
        await claim
          .connect(alice)
          .withdraw(sale.address, reserve.address, preSupply),
      "NOT_SUCCESS",
      "wrongly withrew during Trading"
    );

    // alice buys rest of units
    await sale.connect(alice).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: 1,
      desiredUnits: desiredUnitsAlice,
      maximumPrice: staticPrice,
    });

    const saleStatusSuccess = await sale.saleStatus();

    assert(
      saleStatusSuccess === Status.SUCCESS,
      `wrong status
      expected  ${Status.SUCCESS}
      got       ${saleStatusSuccess}`
    );

    const txDeposit = await claim.sweepPending(
      sale.address,
      reserve.address,
      signers[0].address
    );
    const { supply } = await getEventArgs(txDeposit, "Deposit", claim);

    const txWithdraw0 = await claim
      .connect(alice)
      .withdraw(sale.address, reserve.address, supply);

    const { amount: registeredWithdrawnAmountSigner1 } =
      (await Util.getEventArgs(
        txWithdraw0,
        "Withdraw",
        claim
      )) as WithdrawEvent["args"];

    // total amount withdrawn and registered value should match
    assert(
      registeredWithdrawnAmountSigner1.eq(depositAmount),
      "wrong registered withdrawal value for signer1"
    );

    // not testing further withdrawal behaviour here
  });

  it("should allow undepositing redeemable tokens on failed raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const alice = signers[1];
    const deployer = signers[3];
    const recipient = signers[4];
    const feeRecipient = signers[5];

    const startBlock = await ethers.provider.getBlockNumber();

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

    const [sale, redeemableERC20] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
        calculatePriceStateConfig: {
          sources,
          constants,
        },
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
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    const desiredUnitsAlice = totalTokenSupply;
    const costAlice = staticPrice.mul(desiredUnitsAlice).div(Util.ONE);

    // give alice reserve to cover cost + (fee * 2)
    await reserve.transfer(alice.address, costAlice.add(fee.mul(2)));

    const aliceReserveBalance = await reserve.balanceOf(alice.address);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.start();

    await reserve.connect(alice).approve(sale.address, aliceReserveBalance);

    // alice buys some units
    await sale.connect(alice).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnitsAlice.div(10),
      desiredUnits: desiredUnitsAlice.div(10),
      maximumPrice: staticPrice,
    });

    const saleStatusActive = await sale.saleStatus();

    assert(
      saleStatusActive === Status.ACTIVE,
      `wrong status
        expected  ${Status.ACTIVE}
        got       ${saleStatusActive}`
    );

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

    const preSupply = await reserve.totalSupply();

    // prevent undeposit until status Fail
    await Util.assertError(
      async () =>
        await claim.undeposit(
          sale.address,
          reserve.address,
          preSupply,
          await redeemableERC20.balanceOf(signers[0].address)
        ),
      "NOT_FAIL",
      "wrongly undeposited during Trading"
    );

    // wait until sale can end
    await Util.createEmptyBlock(
      saleTimeout + startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.end();

    const deposit0 = await claim.sweepPending(
      sale.address,
      reserve.address,
      signers[0].address
    );

    const { supply: supply0 } = await getEventArgs(deposit0, "Deposit", claim);

    const { amount: deposited0 } = await Util.getEventArgs(
      txDepositPending0,
      "PendingDeposit",
      claim
    );

    assert(
      deposited0.eq(depositAmount0),
      "actual tokens deposited and registered amount do not match"
    );

    // undeposit claimable tokens
    const undepositTx = await claim.undeposit(
      sale.address,
      reserve.address,
      supply0,
      depositAmount0
    );

    // Undeposit event
    const event = (await Util.getEventArgs(
      undepositTx,
      "Undeposit",
      claim
    )) as UndepositEvent["args"];

    assert(event.sender === signers[0].address, "wrong sender");
    assert(event.sale === getAddress(sale.address), "wrong sale");
    assert(
      event.redeemable === getAddress(redeemableERC20.address),
      "wrong redeemable"
    );
    assert(event.token === getAddress(reserve.address), "wrong token");
    assert(event.supply.eq(supply0), "wrong supply");
    assert(event.amount.eq(depositAmount0), "wrong amount");
  });

  it("should allow depositing redeemable tokens on failed raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const alice = signers[1];
    const deployer = signers[3];
    const recipient = signers[4];
    const feeRecipient = signers[5];

    const startBlock = await ethers.provider.getBlockNumber();

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

    const [sale, redeemableERC20] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleTimeout),
        calculatePriceStateConfig: {
          sources,
          constants,
        },
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
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    const desiredUnitsAlice = totalTokenSupply;
    const costAlice = staticPrice.mul(desiredUnitsAlice).div(Util.ONE);

    // give alice reserve to cover cost + (fee * 2)
    await reserve.transfer(alice.address, costAlice.add(fee.mul(2)));

    const aliceReserveBalance = await reserve.balanceOf(alice.address);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.start();

    await reserve.connect(alice).approve(sale.address, aliceReserveBalance);

    // alice buys some units
    await sale.connect(alice).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnitsAlice.div(10),
      desiredUnits: desiredUnitsAlice.div(10),
      maximumPrice: staticPrice,
    });

    const saleStatusActive = await sale.saleStatus();

    assert(
      saleStatusActive === Status.ACTIVE,
      `wrong status
        expected  ${Status.ACTIVE}
        got       ${saleStatusActive}`
    );

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

    // wait until sale can end
    await Util.createEmptyBlock(
      saleTimeout + startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.end();

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
    const recipient = signers[4];
    const feeRecipient = signers[5];

    const startBlock = await ethers.provider.getBlockNumber();

    const saleDuration = 30;
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

    const [sale, redeemableERC20] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        canStartStateConfig: afterBlockNumberConfig(startBlock),
        canEndStateConfig: afterBlockNumberConfig(startBlock + saleDuration),
        calculatePriceStateConfig: {
          sources,
          constants,
        },
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
    );

    const fee = ethers.BigNumber.from("1").mul(Util.RESERVE_ONE);

    const desiredUnitsAlice = totalTokenSupply;
    const costAlice = staticPrice.mul(desiredUnitsAlice).div(Util.ONE);

    // give alice reserve to cover cost + (fee * 2)
    await reserve.transfer(alice.address, costAlice.add(fee.mul(2)));

    const aliceReserveBalance = await reserve.balanceOf(alice.address);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.start();

    await reserve.connect(alice).approve(sale.address, aliceReserveBalance);

    // alice buys some units
    await sale.connect(alice).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnitsAlice.div(10),
      desiredUnits: desiredUnitsAlice.div(10),
      maximumPrice: staticPrice,
    });

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

    // alice buys rest of units
    await sale.connect(alice).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: 1,
      desiredUnits: desiredUnitsAlice,
      maximumPrice: staticPrice,
    });

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
