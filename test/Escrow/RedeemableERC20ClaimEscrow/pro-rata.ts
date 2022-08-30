import { assert } from "chai";
import { ethers } from "hardhat";
import type {
  ReadWriteTier,
  RedeemableERC20,
  RedeemableERC20ClaimEscrow,
  ReserveToken,
} from "../../../typechain";
import { MockISale, RedeemableERC20Factory } from "../../../typechain";
import {
  DepositEvent,
  WithdrawEvent,
} from "../../../typechain/contracts/escrow/RedeemableERC20ClaimEscrow";
import * as Util from "../../../utils";
import { getEventArgs } from "../../../utils";
import { deployGlobals } from "../../../utils/deploy/escrow";
import { Status } from "../../../utils/types/sale";

let claim: RedeemableERC20ClaimEscrow,
  reserve: ReserveToken,
  redeemableERC20Factory: RedeemableERC20Factory,
  readWriteTier: ReadWriteTier;

describe("RedeemableERC20ClaimEscrow pro-rata test", async function () {
  before(async () => {
    ({ claim, readWriteTier } = await deployGlobals());
  });

  beforeEach(async () => {
    // some other token to put into the escrow
    reserve = (await Util.basicDeploy("ReserveToken", {})) as ReserveToken;
    await reserve.initialize();
    const redeemableERC20FactoryFactory = await ethers.getContractFactory(
      "RedeemableERC20Factory",
      {}
    );
    redeemableERC20Factory =
      (await redeemableERC20FactoryFactory.deploy()) as RedeemableERC20Factory;
    await redeemableERC20Factory.deployed();
  });

  it("should allocate token withdrawals pro rata (sender's proportion of RedeemableERC20 total supply)", async function () {
    const signers = await ethers.getSigners();
    const alice = signers[1];
    const bob = signers[2];
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
    })) as RedeemableERC20;

    const saleFactory = await ethers.getContractFactory("MockISale");
    const sale = (await saleFactory.deploy()) as MockISale;
    await sale.setToken(redeemableERC20.address);

    const desiredUnitsAlice = totalTokenSupply.div(4); // 25%
    const desiredUnitsBob = totalTokenSupply.mul(3).div(4); // 75%

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
      .transfer(alice.address, desiredUnitsAlice);
    await redeemableERC20
      .connect(deployer)
      .transfer(bob.address, desiredUnitsBob);

    await sale.setSaleStatus(Status.SUCCESS);
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

  it("if alice withdraws then burns then bob withdraws, bob does not receive more than his pro-rata share from deposit time due to the subsequent supply change", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[1];
    const alice = signers[4];
    const bob = signers[5];

    const saleFactory = await ethers.getContractFactory("MockISale");
    const sale = (await saleFactory.deploy()) as MockISale;

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
    })) as RedeemableERC20;

    await sale.setToken(redeemableERC20.address);

    const desiredUnitsAlice = totalTokenSupply.div(2);
    const desiredUnitsBob = totalTokenSupply.div(2);

    await redeemableERC20
      .connect(deployer)
      .transfer(alice.address, desiredUnitsAlice);
    await redeemableERC20
      .connect(deployer)
      .transfer(bob.address, desiredUnitsBob);

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

    await sale.setSaleStatus(Status.ACTIVE);

    await sale.setSaleStatus(Status.SUCCESS);

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
});
