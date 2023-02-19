import { assert } from "chai";
import { getAddress } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  ReadWriteTier,
  RedeemableERC20,
  RedeemableERC20ClaimEscrow,
  ReserveToken,
} from "../../../typechain";
import { MockISaleV2 } from "../../../typechain";
import { UndepositEvent } from "../../../typechain/contracts/escrow/RedeemableERC20ClaimEscrow";
import * as Util from "../../../utils";
import { basicDeploy, getEventArgs } from "../../../utils";
import { escrowDeploy } from "../../../utils/deploy/escrow/redeemableERC20ClaimEscrow/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
import { reserveDeploy } from "../../../utils/deploy/test/reserve/deploy";
import { Status } from "../../../utils/types/sale";

let claim: RedeemableERC20ClaimEscrow,
  reserve: ReserveToken,
  readWriteTier: ReadWriteTier;

describe("RedeemableERC20ClaimEscrow undeposit test", async function () {
  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    ({ claim, readWriteTier } = await escrowDeploy());
  });

  beforeEach(async () => {
    // some other token to put into the escrow
    reserve = await reserveDeploy();
  });

  it("should ensure different depositors can both undeposit independently", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[1];
    const alice = signers[3];
    const bob = signers[4];

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

    const sale = (await basicDeploy("MockISaleV2", {})) as MockISaleV2;

    await sale.setToken(redeemableERC20.address);

    const desiredUnitsAlice = totalTokenSupply.div(2);
    const desiredUnitsBob = totalTokenSupply.div(2);

    await sale.setSaleStatus(Status.ACTIVE);

    await redeemableERC20
      .connect(deployer)
      .transfer(alice.address, desiredUnitsAlice);
    await redeemableERC20
      .connect(deployer)
      .transfer(bob.address, desiredUnitsBob);

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

    await sale.setSaleStatus(Status.FAIL);

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

  it("should allow undepositing redeemable tokens on failed raise", async function () {
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

    const sale = (await basicDeploy("MockISaleV2", {})) as MockISaleV2;

    await sale.setToken(redeemableERC20.address);

    const desiredUnitsAlice = totalTokenSupply;

    const aliceReserveBalance = await reserve.balanceOf(alice.address);

    await sale.setSaleStatus(Status.ACTIVE);

    await reserve.connect(alice).approve(sale.address, aliceReserveBalance);

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

    await sale.setSaleStatus(Status.FAIL);

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
});
