import * as Util from "../Util";
import chai from "chai";
import { ethers } from "hardhat";
import { basicSetup, deployGlobals } from "./EscrowUtil";
import type { ReserveToken } from "../../typechain/ReserveToken";
import type {
  DepositEvent,
  RedeemableERC20ClaimEscrow,
  UndepositEvent,
  WithdrawEvent,
} from "../../typechain/RedeemableERC20ClaimEscrow";
import type { RedeemableERC20ClaimEscrowWrapper } from "../../typechain/RedeemableERC20ClaimEscrowWrapper";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import type { TrustFactory } from "../../typechain/TrustFactory";
import type { Contract } from "ethers";
import { getEventArgs, op } from "../Util";
import { concat, getAddress } from "ethers/lib/utils";
import {
  afterBlockNumberConfig,
  Opcode,
  saleDeploy,
  Status,
} from "../Sale/SaleUtil";
import { SaleFactory } from "../../typechain/SaleFactory";

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

enum DistributionStatus {
  PENDING,
  SEEDED,
  TRADING,
  TRADINGCANEND,
  SUCCESS,
  FAIL,
}

let claim: RedeemableERC20ClaimEscrow & Contract,
  claimWrapper: RedeemableERC20ClaimEscrowWrapper & Contract,
  trustFactory: TrustFactory,
  saleFactory: SaleFactory,
  readWriteTier: ReadWriteTier,
  reserveToken: ReserveToken & Contract;

describe("RedeemableERC20ClaimEscrow", async function () {
  before(async () => {
    ({
      claim,
      claimWrapper,
      trustFactory,
      tier: readWriteTier,
      saleFactory,
    } = await deployGlobals());
  });

  beforeEach(async () => {
    // some other token to put into the escrow
    reserveToken = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;
  });

  it("should prevent depositing if rTKN supply has been fully burned", async function () {
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
          stackLength: 1,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserveToken.address,
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
    await reserveToken.transfer(alice.address, costAlice.add(fee.mul(2)));

    const aliceReserveBalance = await reserveToken.balanceOf(alice.address);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.start();

    await reserveToken
      .connect(alice)
      .approve(sale.address, aliceReserveBalance);

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
      "100" + "0".repeat(await reserveToken.decimals())
    );

    await reserveToken.approve(claim.address, depositAmount);

    await claim.depositPending(
      sale.address,
      reserveToken.address,
      depositAmount
    );

    const preSupply = await reserveToken.totalSupply();

    // prevent withdraw until status Success
    await Util.assertError(
      async () =>
        await claim
          .connect(alice)
          .withdraw(sale.address, reserveToken.address, preSupply),
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

    await Util.assertError(
      async () =>
        await claim.depositPending(
          sale.address,
          reserveToken.address,
          depositAmount
        ),
      "NOT_PENDING",
      "did not prevent depositPending when status is not pending"
    );

    await claim.sweepPending(
      sale.address,
      reserveToken.address,
      signers[0].address
    );

    // burn rTKN supply

    const aliceRTKNBalance = await redeemableERC20.balanceOf(alice.address);
    const rTKNSupply0 = await redeemableERC20.totalSupply();
    assert(
      aliceRTKNBalance.eq(rTKNSupply0),
      "alice does not hold full supply of rTKN"
    );

    await redeemableERC20.connect(alice).burn(aliceRTKNBalance);

    const rTKNSupply1 = await redeemableERC20.totalSupply();
    assert(rTKNSupply1.isZero(), "alice failed to burn total rTKN supply");

    // attempt deposit with 0 rTKN supply
    await reserveToken.approve(claim.address, depositAmount);
    const txDeposit = await claim.deposit(
      sale.address,
      reserveToken.address,
      depositAmount
    );

    const { supply } = await getEventArgs(txDeposit, "Deposit", claim);

    const trappedTokens0 = await reserveToken.balanceOf(claim.address);
    console.log({ trappedTokens0 });

    await claim
      .connect(alice)
      .withdraw(sale.address, reserveToken.address, supply);

    const trappedTokens1 = await reserveToken.balanceOf(claim.address);
    console.log({ trappedTokens1 });
    assert(
      trappedTokens1.isZero(),
      "should safely remove tokens from escrow when rTKN supply is zero"
    );
  });

  it("should prevent depositing with zero amount", async function () {
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
          stackLength: 1,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserveToken.address,
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
    await reserveToken.transfer(alice.address, costAlice.add(fee.mul(2)));

    const aliceReserveBalance = await reserveToken.balanceOf(alice.address);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.start();

    await reserveToken
      .connect(alice)
      .approve(sale.address, aliceReserveBalance);

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

    const depositAmount1 = ethers.BigNumber.from(0);

    await reserveToken.approve(claim.address, depositAmount1);

    await Util.assertError(
      async () =>
        await claim.deposit(sale.address, reserveToken.address, depositAmount1),
      "ZERO_DEPOSIT",
      "did not prevent zero deposit amount"
    );
  });

  it("should prevent depositing with zero amount (pending phase)", async function () {
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
          stackLength: 1,
          argumentsLength: 0,
        },
        recipient: recipient.address,
        reserve: reserveToken.address,
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
    await reserveToken.transfer(alice.address, costAlice.add(fee.mul(2)));

    const aliceReserveBalance = await reserveToken.balanceOf(alice.address);

    // wait until sale start
    await Util.createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );

    await sale.start();

    await reserveToken
      .connect(alice)
      .approve(sale.address, aliceReserveBalance);

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

    const depositAmount0 = ethers.BigNumber.from(0);

    await reserveToken.approve(claim.address, depositAmount0);

    await Util.assertError(
      async () =>
        await claim.depositPending(
          sale.address,
          reserveToken.address,
          depositAmount0
        ),
      "ZERO_DEPOSIT",
      "did not prevent zero deposit pending amount"
    );
  });

  it("if alice withdraws then burns then bob withdraws, bob does not receive more than his pro-rata share from deposit time due to the subsequent supply change", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const alice = signers[3];
    const bob = signers[4];

    await readWriteTier.setTier(alice.address, Tier.FOUR, []);
    await readWriteTier.setTier(bob.address, Tier.FOUR, []);

    const {
      redeemableERC20,
      trust,
      reserve,
      crp,
      bPool,
      minimumTradingDuration,
      successLevel,
    } = await basicSetup(signers, trustFactory, readWriteTier);

    const startBlock = await ethers.provider.getBlockNumber();

    // signer1 buys some RedeemableERC20 tokens
    const swapReserveForTokens = async (signer, spend) => {
      // give signer some reserve
      await reserve.transfer(signer.address, spend);

      const reserveSigner = reserve.connect(signer);
      const crpSigner = crp.connect(signer);
      const bPoolSigner = bPool.connect(signer);

      await crpSigner.pokeWeights();
      await reserveSigner.approve(bPool.address, spend);
      await bPoolSigner.swapExactAmountIn(
        reserve.address,
        spend,
        redeemableERC20.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
    };

    const spend = ethers.BigNumber.from("200" + Util.sixZeros);

    // raise all necessary funds
    while ((await reserve.balanceOf(bPool.address)).lt(successLevel)) {
      await swapReserveForTokens(alice, spend);
      await swapReserveForTokens(bob, spend);
    }

    // Distribution Status is Trading
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.TRADING,
      "Distribution Status was not TRADING"
    );

    // deposit claimable tokens
    const depositAmount0 = ethers.BigNumber.from(
      "100" + "0".repeat(await reserveToken.decimals())
    );

    // give signers claimable tokens to deposit
    await reserveToken.transfer(alice.address, depositAmount0);
    await reserveToken.transfer(bob.address, depositAmount0);

    await reserveToken.connect(alice).approve(claim.address, depositAmount0);
    await reserveToken.connect(bob).approve(claim.address, depositAmount0);

    await claim
      .connect(alice)
      .depositPending(trust.address, reserveToken.address, depositAmount0);
    await claim
      .connect(bob)
      .depositPending(trust.address, reserveToken.address, depositAmount0);

    const beginEmptyBlocksBlock = await ethers.provider.getBlockNumber();

    const emptyBlocks =
      startBlock + minimumTradingDuration - beginEmptyBlocksBlock + 1;

    // create empty blocks to end of raise duration
    await Util.createEmptyBlock(emptyBlocks);

    await trust.endDutchAuction();

    // Distribution Status is Success
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.SUCCESS,
      "Distribution Status was not SUCCESS"
    );

    const depositAlice = await claim.sweepPending(
      trust.address,
      reserveToken.address,
      alice.address
    );
    const depositBob = await claim.sweepPending(
      trust.address,
      reserveToken.address,
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
      .withdraw(trust.address, reserveToken.address, supplyFinal);

    const aliceRedeemableERC20TokenBalance = await redeemableERC20.balanceOf(
      alice.address
    );

    // alice burns her RedeemableERC20 tokens
    await redeemableERC20.connect(alice).burn(aliceRedeemableERC20TokenBalance);

    const supplyRedeemableAfterBurn = await redeemableERC20.totalSupply();

    // withdrawing against new RedeemablERC20 supply, rather than registered amount, will revert
    await Util.assertError(
      async () =>
        await claim
          .connect(bob)
          .withdraw(
            trust.address,
            reserveToken.address,
            supplyRedeemableAfterBurn
          ),
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
      .withdraw(trust.address, reserveToken.address, supplyFinal);

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
    const signer1 = signers[3];
    const signer2 = signers[4];

    await readWriteTier.setTier(signer1.address, Tier.FOUR, []);
    await readWriteTier.setTier(signer2.address, Tier.FOUR, []);

    const {
      redeemableERC20,
      trust,
      reserve,
      crp,
      bPool,
      minimumTradingDuration,
    } = await basicSetup(signers, trustFactory, readWriteTier);

    const startBlock = await ethers.provider.getBlockNumber();

    // signer1 buys some RedeemableERC20 tokens
    const swapReserveForTokens = async (signer, spend) => {
      // give signer some reserve
      await reserve.transfer(signer.address, spend);

      const reserveSigner = reserve.connect(signer);
      const crpSigner = crp.connect(signer);
      const bPoolSigner = bPool.connect(signer);

      await crpSigner.pokeWeights();
      await reserveSigner.approve(bPool.address, spend);
      await bPoolSigner.swapExactAmountIn(
        reserve.address,
        spend,
        redeemableERC20.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
    };

    const spend = ethers.BigNumber.from("200" + Util.sixZeros);

    await swapReserveForTokens(signer1, spend);
    await swapReserveForTokens(signer2, spend);

    // Distribution Status is Trading
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.TRADING,
      "Distribution Status was not TRADING"
    );

    // deposit claimable tokens
    const depositAmount0 = ethers.BigNumber.from(
      "100" + "0".repeat(await reserveToken.decimals())
    );

    // give signers claimable tokens to deposit
    await reserveToken.transfer(signer1.address, depositAmount0);
    await reserveToken.transfer(signer2.address, depositAmount0);

    await reserveToken.connect(signer1).approve(claim.address, depositAmount0);
    await reserveToken.connect(signer2).approve(claim.address, depositAmount0);

    const txDepositPending0 = await claim
      .connect(signer1)
      .depositPending(trust.address, reserveToken.address, depositAmount0);
    const txDepositPending1 = await claim
      .connect(signer2)
      .depositPending(trust.address, reserveToken.address, depositAmount0);

    const beginEmptyBlocksBlock = await ethers.provider.getBlockNumber();

    const emptyBlocks =
      startBlock + minimumTradingDuration - beginEmptyBlocksBlock + 1;

    // create empty blocks to end of raise duration
    await Util.createEmptyBlock(emptyBlocks);

    await trust.endDutchAuction();

    // Distribution Status is Fail
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.FAIL,
      "Distribution Status was not FAIL"
    );

    await claim.sweepPending(
      trust.address,
      reserveToken.address,
      signer1.address
    );
    const deposit1 = await claim.sweepPending(
      trust.address,
      reserveToken.address,
      signer2.address
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

    // Distribution Status is Fail
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.FAIL,
      "Distribution Status was not FAIL"
    );

    // undeposit claimable tokens
    const undepositTx0 = await claim
      .connect(signer1)
      .undeposit(
        trust.address,
        reserveToken.address,
        supplyFinal,
        depositAmount0
      );
    const undepositTx1 = await claim
      .connect(signer2)
      .undeposit(
        trust.address,
        reserveToken.address,
        supplyFinal,
        depositAmount0
      );

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
    assert(undepositEvent0.sender === signer1.address, "wrong sender");
    assert(undepositEvent0.sale === getAddress(trust.address), "wrong trust");
    assert(
      undepositEvent0.redeemable === getAddress(redeemableERC20.address),
      "wrong redeemable"
    );
    assert(
      undepositEvent0.token === getAddress(reserveToken.address),
      "wrong token"
    );
    assert(undepositEvent0.supply.eq(supplyFinal), "wrong supply");
    assert(undepositEvent0.amount.eq(depositAmount0), "wrong amount");

    // undepositEvent1
    assert(undepositEvent1.sender === signer2.address, "wrong sender");
    assert(undepositEvent1.sale === getAddress(trust.address), "wrong trust");
    assert(
      undepositEvent1.redeemable === getAddress(redeemableERC20.address),
      "wrong redeemable"
    );
    assert(
      undepositEvent1.token === getAddress(reserveToken.address),
      "wrong token"
    );
    assert(undepositEvent1.supply.eq(supplyFinal), "wrong supply");
    assert(undepositEvent1.amount.eq(depositAmount0), "wrong amount");
  });

  it("should distribute correct withdrawal proportion if RedeemableERC20 tokens are burned", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const signer1 = signers[3];
    const signer2 = signers[4];

    await readWriteTier.setTier(signer1.address, Tier.FOUR, []);
    await readWriteTier.setTier(signer2.address, Tier.FOUR, []);

    const {
      redeemableERC20,
      trust,
      reserve,
      crp,
      bPool,
      minimumTradingDuration,
      successLevel,
    } = await basicSetup(signers, trustFactory, readWriteTier);

    const startBlock = await ethers.provider.getBlockNumber();

    const swapReserveForTokens = async (signer, spend) => {
      // give signer some reserve
      await reserve.transfer(signer.address, spend);

      const reserveSigner = reserve.connect(signer);
      const crpSigner = crp.connect(signer);
      const bPoolSigner = bPool.connect(signer);

      await crpSigner.pokeWeights();
      await reserveSigner.approve(bPool.address, spend);
      await bPoolSigner.swapExactAmountIn(
        reserve.address,
        spend,
        redeemableERC20.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
    };

    const spend1 = ethers.BigNumber.from("50" + Util.sixZeros);
    const spend2 = ethers.BigNumber.from("50" + Util.sixZeros);

    // raise all necessary funds
    while ((await reserve.balanceOf(bPool.address)).lt(successLevel)) {
      await swapReserveForTokens(signer1, spend1);
      await swapReserveForTokens(signer2, spend2);
    }

    const dustAtSuccessLevel = Util.determineReserveDust(successLevel).add(2); // rounding error

    // cover the dust amount
    await swapReserveForTokens(signer1, dustAtSuccessLevel);

    // deposit claimable tokens
    const depositAmount = ethers.BigNumber.from(
      "100" + "0".repeat(await reserveToken.decimals())
    );

    await reserveToken.approve(claim.address, depositAmount);
    // creator deposits claimable tokens
    await claim.depositPending(
      trust.address,
      reserveToken.address,
      depositAmount
    );

    const beginEmptyBlocksBlock = await ethers.provider.getBlockNumber();
    const emptyBlocks =
      startBlock + minimumTradingDuration - beginEmptyBlocksBlock + 1;

    // create empty blocks to end of raise duration
    await Util.createEmptyBlock(emptyBlocks);

    await trust.endDutchAuction();

    const sweep0 = await claim.sweepPending(
      trust.address,
      reserveToken.address,
      signers[0].address
    );

    const supply0 = (await getEventArgs(sweep0, "Deposit", claim)).supply;

    // Distribution Status is Success
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.SUCCESS,
      `Distribution Status was not SUCCESS, got ${await trust.getDistributionStatus()}`
    );

    // calculate real RedeemableERC20 proportions
    const signer1Prop = (await redeemableERC20.balanceOf(signer1.address))
      .mul(Util.ONE)
      .div(await redeemableERC20.totalSupply());

    // signer1 should withdraw roughly 50% of claimable tokens in escrow
    await claim
      .connect(signer1)
      .withdraw(trust.address, reserveToken.address, supply0);

    const expectedSigner1Withdrawal0 = depositAmount
      .mul(signer1Prop)
      .div(Util.ONE);

    const actualSigner1Withdrawal0 = await reserveToken.balanceOf(
      signer1.address
    );

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
      .connect(signer2)
      .redeem(
        [reserve.address],
        await redeemableERC20.balanceOf(signer2.address)
      );

    // more claimable tokens are deposited by creator
    await reserveToken.approve(claim.address, depositAmount);
    const deposit1 = await claim.deposit(
      trust.address,
      reserveToken.address,
      depositAmount
    );

    const supply1 = (await getEventArgs(deposit1, "Deposit", claim)).supply;

    // recalculate real RedeemableERC20 proportions
    const signer1PropAfterBurn = (
      await redeemableERC20.balanceOf(signer1.address)
    )
      .mul(Util.ONE)
      .div(await redeemableERC20.totalSupply());

    // signer1 2nd withdraw
    await claim
      .connect(signer1)
      .withdraw(trust.address, reserveToken.address, supply1);

    const expectedSigner1Withdrawal1 = depositAmount
      .mul(signer1PropAfterBurn)
      .div(Util.ONE);

    const actualSigner1Withdrawal1 = (
      await reserveToken.balanceOf(signer1.address)
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
    const signer1 = signers[3];
    const signer2 = signers[4];

    await readWriteTier.setTier(signer1.address, Tier.FOUR, []);
    await readWriteTier.setTier(signer2.address, Tier.FOUR, []);

    const {
      redeemableERC20,
      trust,
      reserve,
      crp,
      bPool,
      minimumTradingDuration,
      successLevel,
    } = await basicSetup(signers, trustFactory, readWriteTier);

    const startBlock = await ethers.provider.getBlockNumber();

    const swapReserveForTokens = async (signer, spend) => {
      // give signer some reserve
      await reserve.transfer(signer.address, spend);

      const reserveSigner = reserve.connect(signer);
      const crpSigner = crp.connect(signer);
      const bPoolSigner = bPool.connect(signer);

      await crpSigner.pokeWeights();
      await reserveSigner.approve(bPool.address, spend);
      await bPoolSigner.swapExactAmountIn(
        reserve.address,
        spend,
        redeemableERC20.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
    };

    const spend1 = ethers.BigNumber.from("25" + Util.sixZeros);
    const spend2 = ethers.BigNumber.from("75" + Util.sixZeros);

    // raise all necessary funds
    while ((await reserve.balanceOf(bPool.address)).lt(successLevel)) {
      await swapReserveForTokens(signer1, spend1);
      await swapReserveForTokens(signer2, spend2);
    }

    const dustAtSuccessLevel = Util.determineReserveDust(successLevel).add(2); // rounding error

    // cover the dust amount
    await swapReserveForTokens(signer1, dustAtSuccessLevel);

    // deposit claimable tokens
    const depositAmount = ethers.BigNumber.from(
      "100" + "0".repeat(await reserveToken.decimals())
    );

    await reserveToken.approve(claimWrapper.address, depositAmount);
    // creator deposits claimable tokens
    await claimWrapper.depositPending(
      trust.address,
      reserveToken.address,
      depositAmount
    );

    const beginEmptyBlocksBlock = await ethers.provider.getBlockNumber();
    const emptyBlocks =
      startBlock + minimumTradingDuration - beginEmptyBlocksBlock + 1;

    // create empty blocks to end of raise duration
    await Util.createEmptyBlock(emptyBlocks);

    await trust.endDutchAuction();

    const deposit0 = await claimWrapper.sweepPending(
      trust.address,
      reserveToken.address,
      signers[0].address
    );
    const supply0 = (await getEventArgs(deposit0, "Deposit", claimWrapper))
      .supply;

    // Distribution Status is Success
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.SUCCESS,
      `Distribution Status was not SUCCESS, got ${await trust.getDistributionStatus()}`
    );

    // calculate real RedeemableERC20 proportions
    const signer1Prop = (await redeemableERC20.balanceOf(signer1.address))
      .mul(Util.ONE)
      .div(await redeemableERC20.totalSupply());

    // signer1 should withdraw roughly 25% of claimable tokens in escrow
    await claimWrapper
      .connect(signer1)
      .withdraw(trust.address, reserveToken.address, supply0);

    const expectedSigner1Withdrawal0 = depositAmount
      .mul(signer1Prop)
      .div(Util.ONE);

    const actualSigner1Withdrawal0 = await reserveToken.balanceOf(
      signer1.address
    );

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
          .connect(signer1)
          .withdraw(trust.address, reserveToken.address, supply0),
      "ZERO_WITHDRAW",
      "Failed to error on zero withdraw"
    );

    // more claimable tokens are deposited by creator
    await reserveToken.approve(claimWrapper.address, depositAmount);
    const deposit1 = await claimWrapper.deposit(
      trust.address,
      reserveToken.address,
      depositAmount
    );
    const supply1 = (await getEventArgs(deposit1, "Deposit", claimWrapper))
      .supply;

    const claimableTokensInEscrowDeposit1 = await claimWrapper.getTotalDeposits(
      trust.address,
      reserveToken.address,
      await redeemableERC20.totalSupply()
    );

    // signer1 3rd withdraw
    await claimWrapper
      .connect(signer1)
      .withdraw(trust.address, reserveToken.address, supply1);

    const expectedSigner1Withdrawal1 = depositAmount
      .mul(signer1Prop)
      .div(Util.ONE);

    const actualSigner1Withdrawal1 = (
      await reserveToken.balanceOf(signer1.address)
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
    const signer1 = signers[3];
    const signer2 = signers[4];

    await readWriteTier.setTier(signer1.address, Tier.FOUR, []);
    await readWriteTier.setTier(signer2.address, Tier.FOUR, []);

    const {
      redeemableERC20,
      trust,
      reserve,
      crp,
      bPool,
      minimumTradingDuration,
      successLevel,
    } = await basicSetup(signers, trustFactory, readWriteTier);

    const startBlock = await ethers.provider.getBlockNumber();

    const swapReserveForTokens = async (signer, spend) => {
      // give signer some reserve
      await reserve.transfer(signer.address, spend);

      const reserveSigner = reserve.connect(signer);
      const crpSigner = crp.connect(signer);
      const bPoolSigner = bPool.connect(signer);

      await crpSigner.pokeWeights();
      await reserveSigner.approve(bPool.address, spend);
      await bPoolSigner.swapExactAmountIn(
        reserve.address,
        spend,
        redeemableERC20.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
    };

    const spend1 = ethers.BigNumber.from("25" + Util.sixZeros);
    const spend2 = ethers.BigNumber.from("75" + Util.sixZeros);

    // raise all necessary funds
    while ((await reserve.balanceOf(bPool.address)).lt(successLevel)) {
      await swapReserveForTokens(signer1, spend1);
      await swapReserveForTokens(signer2, spend2);
    }

    const dustAtSuccessLevel = Util.determineReserveDust(successLevel).add(2); // rounding error

    // cover the dust amount
    await swapReserveForTokens(signer1, dustAtSuccessLevel);

    // deposit claimable tokens
    const depositAmount = ethers.BigNumber.from(
      "100" + "0".repeat(await reserveToken.decimals())
    );

    await reserveToken.approve(claim.address, depositAmount);

    // creator deposits claimable tokens
    await claim.depositPending(
      trust.address,
      reserveToken.address,
      depositAmount
    );

    const beginEmptyBlocksBlock = await ethers.provider.getBlockNumber();
    const emptyBlocks =
      startBlock + minimumTradingDuration - beginEmptyBlocksBlock + 1;

    // create empty blocks to end of raise duration
    await Util.createEmptyBlock(emptyBlocks);

    await trust.endDutchAuction();

    const deposit = await claim.sweepPending(
      trust.address,
      reserveToken.address,
      signers[0].address
    );
    const supply = (await getEventArgs(deposit, "Deposit", claim)).supply;

    // Distribution Status is Success
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.SUCCESS,
      `Distribution Status was not SUCCESS, got ${await trust.getDistributionStatus()}`
    );

    const signer1Prop = (await redeemableERC20.balanceOf(signer1.address))
      .mul(Util.ONE)
      .div(await redeemableERC20.totalSupply());

    const expectedWithdrawal = depositAmount.mul(signer1Prop).div(Util.ONE);

    // signer1 should withdraw roughly 25% of claimable tokens in escrow
    await claim
      .connect(signer1)
      .withdraw(trust.address, reserveToken.address, supply);

    const actualWithdrawal = await reserveToken.balanceOf(signer1.address);

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
    await claim
      .connect(signer2)
      .withdraw(trust.address, reserveToken.address, supply);

    const finalEscrowClaimableTokenBalance = await reserveToken.balanceOf(
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
    const signer1 = signers[3];

    await readWriteTier.setTier(signer1.address, Tier.FOUR, []);

    const {
      redeemableERC20,
      trust,
      reserve,
      crp,
      bPool,
      minimumTradingDuration,
      successLevel,
    } = await basicSetup(signers, trustFactory, readWriteTier);

    const startBlock = await ethers.provider.getBlockNumber();

    // signer1 buys some RedeemableERC20 tokens
    const swapReserveForTokens = async (signer, spend) => {
      // give signer some reserve
      await reserve.transfer(signer.address, spend);

      const reserveSigner = reserve.connect(signer);
      const crpSigner = crp.connect(signer);
      const bPoolSigner = bPool.connect(signer);

      await crpSigner.pokeWeights();
      await reserveSigner.approve(bPool.address, spend);
      await bPoolSigner.swapExactAmountIn(
        reserve.address,
        spend,
        redeemableERC20.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
    };

    const spend = ethers.BigNumber.from("200" + Util.sixZeros);

    await swapReserveForTokens(signer1, spend);

    // Distribution Status is Trading
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.TRADING,
      "Distribution Status was not TRADING"
    );

    // deposit claimable tokens
    const depositAmount = ethers.BigNumber.from(
      "100" + "0".repeat(await reserveToken.decimals())
    );

    await reserveToken.approve(claim.address, depositAmount);

    await claim.depositPending(
      trust.address,
      reserveToken.address,
      depositAmount
    );

    const preSupply = await reserveToken.totalSupply();

    // prevent withdraw until status Success
    await Util.assertError(
      async () =>
        await claim
          .connect(signer1)
          .withdraw(trust.address, reserveToken.address, preSupply),
      "NOT_SUCCESS",
      "wrongly withrew during Trading"
    );

    // raise all necessary funds
    while ((await reserve.balanceOf(bPool.address)).lt(successLevel)) {
      await swapReserveForTokens(signer1, spend);
    }

    const dustAtSuccessLevel = Util.determineReserveDust(successLevel).add(2); // rounding error

    // cover the dust amount
    await swapReserveForTokens(signer1, dustAtSuccessLevel);

    const beginEmptyBlocksBlock = await ethers.provider.getBlockNumber();
    const emptyBlocks =
      startBlock + minimumTradingDuration - beginEmptyBlocksBlock + 1;

    // create empty blocks to end of raise duration
    await Util.createEmptyBlock(emptyBlocks);

    // prevent withdraw until status Success
    await Util.assertError(
      async () =>
        await claim
          .connect(signer1)
          .withdraw(trust.address, reserveToken.address, preSupply),
      "NOT_SUCCESS",
      "wrongly withdrew during TradingCanEnd"
    );

    await trust.endDutchAuction();

    await Util.assertError(
      async () =>
        await claim.depositPending(
          trust.address,
          reserve.address,
          depositAmount
        ),
      "NOT_PENDING",
      "did not prevent depositPending when status is not pending"
    );

    const deposit = await claim.sweepPending(
      trust.address,
      reserveToken.address,
      signers[0].address
    );
    const { supply } = await getEventArgs(deposit, "Deposit", claim);

    // Distribution Status is Success
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.SUCCESS,
      `Distribution Status was not SUCCESS, got ${await trust.getDistributionStatus()}`
    );

    const txWithdraw0 = await claim
      .connect(signer1)
      .withdraw(trust.address, reserveToken.address, supply);

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
    const signer1 = signers[3];

    await readWriteTier.setTier(signer1.address, Tier.FOUR, []);

    const {
      redeemableERC20,
      trust,
      reserve,
      crp,
      bPool,
      minimumTradingDuration,
    } = await basicSetup(signers, trustFactory, readWriteTier);

    const startBlock = await ethers.provider.getBlockNumber();

    // signer1 buys some RedeemableERC20 tokens
    const swapReserveForTokens = async (signer, spend) => {
      // give signer some reserve
      await reserve.transfer(signer.address, spend);

      const reserveSigner = reserve.connect(signer);
      const crpSigner = crp.connect(signer);
      const bPoolSigner = bPool.connect(signer);

      await crpSigner.pokeWeights();
      await reserveSigner.approve(bPool.address, spend);
      await bPoolSigner.swapExactAmountIn(
        reserve.address,
        spend,
        redeemableERC20.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
    };

    const spend = ethers.BigNumber.from("200" + Util.sixZeros);

    await swapReserveForTokens(signer1, spend);

    // Distribution Status is Trading
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.TRADING,
      "Distribution Status was not TRADING"
    );

    // deposit claimable tokens
    const depositAmount0 = ethers.BigNumber.from(
      "100" + "0".repeat(await reserveToken.decimals())
    );

    await reserveToken.approve(claim.address, depositAmount0);

    const txDepositPending0 = await claim.depositPending(
      trust.address,
      reserveToken.address,
      depositAmount0
    );

    const beginEmptyBlocksBlock = await ethers.provider.getBlockNumber();

    const preSupply = await reserveToken.totalSupply();

    // prevent undeposit until status Fail
    await Util.assertError(
      async () =>
        await claim.undeposit(
          trust.address,
          reserveToken.address,
          preSupply,
          await redeemableERC20.balanceOf(signers[0].address)
        ),
      "NOT_FAIL",
      "wrongly undeposited during Trading"
    );

    const emptyBlocks =
      startBlock + minimumTradingDuration - beginEmptyBlocksBlock + 1;

    // create empty blocks to end of raise duration
    await Util.createEmptyBlock(emptyBlocks);

    // prevent undeposit until status Fail
    await Util.assertError(
      async () =>
        await claim.undeposit(
          trust.address,
          reserveToken.address,
          preSupply,
          await redeemableERC20.balanceOf(signers[0].address)
        ),
      "NOT_FAIL",
      "wrongly undeposited during TradingCanEnd"
    );

    await trust.endDutchAuction();

    const deposit0 = await claim.sweepPending(
      trust.address,
      reserveToken.address,
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

    // Distribution Status is Fail
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.FAIL,
      "Distribution Status was not FAIL"
    );

    // undeposit claimable tokens
    const undepositTx = await claim.undeposit(
      trust.address,
      reserveToken.address,
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
    assert(event.sale === getAddress(trust.address), "wrong trust");
    assert(
      event.redeemable === getAddress(redeemableERC20.address),
      "wrong redeemable"
    );
    assert(event.token === getAddress(reserveToken.address), "wrong token");
    assert(event.supply.eq(supply0), "wrong supply");
    assert(event.amount.eq(depositAmount0), "wrong amount");
  });

  it("should allow depositing redeemable tokens on failed raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const signer1 = signers[3];

    await readWriteTier.setTier(signer1.address, Tier.FOUR, []);

    const {
      redeemableERC20,
      trust,
      reserve,
      crp,
      bPool,
      minimumTradingDuration,
    } = await basicSetup(signers, trustFactory, readWriteTier);

    const startBlock = await ethers.provider.getBlockNumber();

    // signer1 buys some RedeemableERC20 tokens
    const swapReserveForTokens = async (signer, spend) => {
      // give signer some reserve
      await reserve.transfer(signer.address, spend);

      const reserveSigner = reserve.connect(signer);
      const crpSigner = crp.connect(signer);
      const bPoolSigner = bPool.connect(signer);

      await crpSigner.pokeWeights();
      await reserveSigner.approve(bPool.address, spend);
      await bPoolSigner.swapExactAmountIn(
        reserve.address,
        spend,
        redeemableERC20.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
    };

    const spend = ethers.BigNumber.from("200" + Util.sixZeros);

    await swapReserveForTokens(signer1, spend);

    // Distribution Status is Trading
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.TRADING,
      "Distribution Status was not TRADING"
    );

    // deposit claimable tokens
    const depositAmount0 = ethers.BigNumber.from(
      "100" + "0".repeat(await reserveToken.decimals())
    );

    await reserveToken.approve(claim.address, depositAmount0);

    const txDepositPending0 = await claim.depositPending(
      trust.address,
      reserveToken.address,
      depositAmount0
    );

    const beginEmptyBlocksBlock = await ethers.provider.getBlockNumber();
    const emptyBlocks =
      startBlock + minimumTradingDuration - beginEmptyBlocksBlock + 1;

    // create empty blocks to end of raise duration
    await Util.createEmptyBlock(emptyBlocks);

    await trust.endDutchAuction();

    await claim.sweepPending(
      trust.address,
      reserveToken.address,
      signers[0].address
    );

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

    // Distribution Status is Fail
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.FAIL,
      "Distribution Status was not FAIL"
    );

    const depositAmount1 = ethers.BigNumber.from(
      "100" + "0".repeat(await reserveToken.decimals())
    );

    await reserveToken.approve(claim.address, depositAmount1);

    // can deposit and undeposit when fail
    await claim.deposit(trust.address, reserveToken.address, depositAmount1);

    await claim.undeposit(
      trust.address,
      reserveToken.address,
      supply,
      depositAmount1
    );
  });

  it("should allow depositing redeemable tokens when not failed raise (during trading or successfully closed)", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const signer1 = signers[3];

    await readWriteTier.setTier(signer1.address, Tier.FOUR, []);

    const {
      redeemableERC20,
      trust,
      reserve,
      crp,
      bPool,
      successLevel,
      minimumTradingDuration,
    } = await basicSetup(signers, trustFactory, readWriteTier);

    const startBlock = await ethers.provider.getBlockNumber();

    // signer1 buys some RedeemableERC20 tokens
    const swapReserveForTokens = async (signer, spend) => {
      // give signer some reserve
      await reserve.transfer(signer.address, spend);

      const reserveSigner = reserve.connect(signer);
      const crpSigner = crp.connect(signer);
      const bPoolSigner = bPool.connect(signer);

      await crpSigner.pokeWeights();
      await reserveSigner.approve(bPool.address, spend);
      await bPoolSigner.swapExactAmountIn(
        reserve.address,
        spend,
        redeemableERC20.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
    };

    const spend = ethers.BigNumber.from("200" + Util.sixZeros);

    await swapReserveForTokens(signer1, spend);

    // Distribution Status is Trading
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.TRADING,
      "Distribution Status was not TRADING"
    );

    // deposit some claimable tokens
    const depositAmount0 = ethers.BigNumber.from(
      "100" + "0".repeat(await reserveToken.decimals())
    );

    await reserveToken.approve(claim.address, depositAmount0);

    await Util.assertError(
      async () =>
        await claim.deposit(trust.address, reserve.address, depositAmount0),
      "PENDING",
      "did not prevent deposit during pending phase"
    );

    const txDepositPending0 = await claim.depositPending(
      trust.address,
      reserveToken.address,
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

    // succeed raise
    while ((await reserve.balanceOf(bPool.address)).lt(successLevel)) {
      await swapReserveForTokens(signer1, spend);
    }

    const dustAtSuccessLevel = Util.determineReserveDust(successLevel).add(2); // rounding error

    // cover the dust amount
    await swapReserveForTokens(signer1, dustAtSuccessLevel);

    const beginEmptyBlocksBlock = await ethers.provider.getBlockNumber();
    const emptyBlocks =
      startBlock + minimumTradingDuration - beginEmptyBlocksBlock + 1;

    // create empty blocks to end of raise duration
    await Util.createEmptyBlock(emptyBlocks);

    // Distribution Status is TradingCanEnd
    assert(
      (await trust.getDistributionStatus()) ===
        DistributionStatus.TRADINGCANEND,
      "Distribution Status was not TRADINGCANEND"
    );

    // deposit some claimable tokens
    const depositAmount1 = ethers.BigNumber.from(
      "100" + "0".repeat(await reserveToken.decimals())
    );

    // creator deposits some tokens for claiming
    await reserveToken.approve(claim.address, depositAmount1);

    const txDepositPending1 = await claim.depositPending(
      trust.address,
      reserveToken.address,
      depositAmount1
    );

    const { amount: deposited1 } = await Util.getEventArgs(
      txDepositPending1,
      "PendingDeposit",
      claim
    );

    const totalDepositedActual0 = deposited0.add(deposited1);
    const totalDepositedExpected0 = depositAmount1.add(depositAmount0);

    assert(
      totalDepositedActual0.eq(totalDepositedExpected0),
      `actual tokens deposited by sender and registered amount do not match (1)
      expected  ${totalDepositedExpected0} = ${depositAmount1} + ${depositAmount0}
      got       ${totalDepositedActual0}`
    );

    await trust.endDutchAuction();

    // Distribution Status is Success
    assert(
      (await trust.getDistributionStatus()) === DistributionStatus.SUCCESS,
      `Distribution Status was not SUCCESS, got ${await trust.getDistributionStatus()}`
    );

    // deposit some claimable tokens
    const depositAmount2 = ethers.BigNumber.from(
      "100" + "0".repeat(await reserveToken.decimals())
    );

    await reserveToken.approve(claim.address, depositAmount2);

    const txSweep0 = await claim.sweepPending(
      trust.address,
      reserveToken.address,
      signers[0].address
    );

    const {
      sender,
      depositor,
      sale: trustAddress,
      redeemable,
      token,
      amount,
    } = await Util.getEventArgs(txSweep0, "Sweep", claim);

    assert(sender === signers[0].address, "wrong sender");
    assert(depositor === signers[0].address, "wrong depositor");
    assert(trustAddress === getAddress(trust.address), "wrong trust address");
    assert(
      redeemable === getAddress(redeemableERC20.address),
      "wrong redeemable address"
    );
    assert(token === getAddress(reserveToken.address), "wrong token address");
    assert(amount.eq(totalDepositedExpected0), "wrong amount");

    const txDeposit0 = await claim.deposit(
      trust.address,
      reserveToken.address,
      depositAmount2
    );

    const eventDeposit0 = (await Util.getEventArgs(
      txDeposit0,
      "Deposit",
      claim
    )) as DepositEvent["args"];

    assert(eventDeposit0.depositor === signers[0].address, "wrong depositor");
    assert(eventDeposit0.sale === getAddress(trust.address), "wrong trust");
    assert(
      eventDeposit0.redeemable === getAddress(redeemableERC20.address),
      "wrong redeemable address"
    );
    assert(
      eventDeposit0.token === getAddress(reserveToken.address),
      "wrong token address"
    );
    assert(
      eventDeposit0.supply.eq(await redeemableERC20.totalSupply()),
      "wrong supply"
    );
    assert(eventDeposit0.amount.eq(depositAmount2), "wrong amount");

    const totalDepositedActual1 = eventDeposit0.amount
      .add(deposited1)
      .add(deposited0);
    const totalDepositedExpected1 = depositAmount2.add(
      depositAmount1.add(depositAmount0)
    );

    assert(
      totalDepositedActual1.eq(totalDepositedExpected1),
      `actual tokens deposited by sender and registered amount do not match (2)
      expected  ${totalDepositedExpected1} = ${depositAmount2} + ${depositAmount1} + ${depositAmount0}
      got       ${totalDepositedActual1}`
    );
  });
});
