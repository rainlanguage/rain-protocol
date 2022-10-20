import { assert } from "chai";
import { ethers } from "hardhat";
import type {
  ReadWriteTier,
  RedeemableERC20,
  RedeemableERC20ClaimEscrow,
  RedeemableERC20ClaimEscrowWrapper,
  ReserveToken,
} from "../../../typechain";
import { MockISale, RedeemableERC20Factory } from "../../../typechain";
import { WithdrawEvent } from "../../../typechain/contracts/escrow/RedeemableERC20ClaimEscrow";
import * as Util from "../../../utils";
import { getEventArgs } from "../../../utils";
import { escrowDeploy } from "../../../utils/deploy/escrow/redeemableERC20ClaimEscrow/deploy";
import { Status } from "../../../utils/types/sale";

let claim: RedeemableERC20ClaimEscrow,
  claimWrapper: RedeemableERC20ClaimEscrowWrapper,
  reserve: ReserveToken,
  redeemableERC20Factory: RedeemableERC20Factory,
  readWriteTier: ReadWriteTier;

describe("RedeemableERC20ClaimEscrow Withdraw test", async function () {
  before(async () => {
    ({ claim, claimWrapper, readWriteTier } = await escrowDeploy());
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

  it("should allow withdrawing redeemable tokens on successful raise", async function () {
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
    })) as RedeemableERC20;

    const saleFactory = await ethers.getContractFactory("MockISale");
    const sale = (await saleFactory.deploy()) as MockISale;
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

    await redeemableERC20
      .connect(deployer)
      .transfer(alice.address, desiredUnitsAlice.mul(9).div(10));
    await sale.setSaleStatus(Status.SUCCESS);
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

  it("should support multiple withdrawals per sender if more claimable tokens are deposited after a withdrawal", async function () {
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

  it("should distribute correct withdrawal proportion if RedeemableERC20 tokens are burned", async function () {
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

    const desiredUnitsAlice = totalTokenSupply.div(2);
    const desiredUnitsBob = totalTokenSupply.div(2);

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
    await redeemableERC20.endDistribution(deployer.address);
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
});
