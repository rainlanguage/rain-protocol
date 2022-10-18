import { assert } from "chai";
import { ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { MockISale } from "../../../typechain";
import { ReadWriteTier } from "../../../typechain";
import { RedeemableERC20ClaimEscrow } from "../../../typechain";
import { RedeemableERC20Factory } from "../../../typechain";
import { ReserveToken } from "../../../typechain";
import { SaleFactory } from "../../../typechain";
import { SaleConstructorConfigStruct } from "../../../typechain/contracts/sale/Sale";
import { assertError } from "../../../utils/test/assertError";
import { SaleStatus } from "../../../utils/types/saleEscrow";

let redeemableERC20FactoryFactory: ContractFactory,
  redeemableERC20Factory: RedeemableERC20Factory,
  readWriteTierFactory: ContractFactory,
  readWriteTier: ReadWriteTier,
  saleConstructorConfig: SaleConstructorConfigStruct,
  saleFactoryFactory: ContractFactory,
  saleFactory: SaleFactory;

describe("SaleEscrow protection from draining", async function () {
  before(async () => {
    const integrityFactory = await ethers.getContractFactory(
      "StandardIntegrity"
    );
    const integrity = await integrityFactory.deploy();
    await integrity.deployed();

    redeemableERC20FactoryFactory = await ethers.getContractFactory(
      "RedeemableERC20Factory",
      {}
    );
    redeemableERC20Factory =
      (await redeemableERC20FactoryFactory.deploy()) as RedeemableERC20Factory;
    await redeemableERC20Factory.deployed();

    readWriteTierFactory = await ethers.getContractFactory("ReadWriteTier");
    readWriteTier = (await readWriteTierFactory.deploy()) as ReadWriteTier;
    await readWriteTier.deployed();

    saleConstructorConfig = {
      maximumSaleTimeout: 1000,
      maximumCooldownDuration: 1000,
      redeemableERC20Factory: redeemableERC20Factory.address,
      interpreterIntegrity: integrity.address,
    };

    saleFactoryFactory = await ethers.getContractFactory("SaleFactory", {});
    saleFactory = (await saleFactoryFactory.deploy(
      saleConstructorConfig
    )) as SaleFactory;
    await saleFactory.deployed();
  });

  it("if a sale creates a redeemable token that doesn't freeze, it should not be possible to drain the RedeemableERC20ClaimEscrow by repeatedly claiming after moving the same funds somewhere else (in the case of failed Sale)", async function () {
    const signers = await ethers.getSigners();

    const signer1 = signers[1];
    const signer2 = signers[2];

    // Deploy global Claim contract
    const rTKNClaimEscrowFactory = await ethers.getContractFactory(
      "RedeemableERC20ClaimEscrow"
    );
    const rTKNClaimEscrow =
      (await rTKNClaimEscrowFactory.deploy()) as RedeemableERC20ClaimEscrow;

    const tokenFactory = await ethers.getContractFactory("ReserveToken");
    const reserve = (await tokenFactory.deploy()) as ReserveToken;
    const rTKN = (await tokenFactory.deploy()) as ReserveToken;

    await reserve.deployed();
    await rTKN.deployed();

    await reserve.initialize();
    await rTKN.initialize();
    const saleFactory = await ethers.getContractFactory("MockISale");
    const sale1 = (await saleFactory.deploy()) as MockISale;
    const sale2 = (await saleFactory.deploy()) as MockISale;

    // Two identical successful sales with some tokens to distribute.
    const sales: Array<MockISale> = [sale1, sale2];
    for (const sale of sales) {
      await sale.deployed();
      await sale.setReserve(reserve.address);
      await sale.setToken(rTKN.address);
      await sale.setSaleStatus(SaleStatus.Success);
      await reserve.approve(rTKNClaimEscrow.address, 1000);
      await rTKNClaimEscrow.deposit(sale.address, reserve.address, 1000);
    }

    assert(
      (await rTKN.balanceOf(signer1.address)).eq(0),
      "signer 1 had token balance prematurely"
    );
    // If signer1 has all the token they should get all deposited reserve.
    await rTKN.transfer(signer1.address, await rTKN.totalSupply());

    await rTKNClaimEscrow
      .connect(signer1)
      .withdraw(sale1.address, reserve.address, await rTKN.totalSupply());

    assert(
      (await reserve.balanceOf(signer1.address)).eq(1000),
      `signer 1 did not withdraw the deposited reserve`
    );

    // At this point signer 1 has withdrawn all they can for sale1.
    await assertError(
      async () =>
        await rTKNClaimEscrow
          .connect(signer1)
          .withdraw(sale1.address, reserve.address, await rTKN.totalSupply()),
      "ZERO_WITHDRAW",
      "didn't prevent signer 1 from withdrawing a second time"
    );

    // At this point there is still 1000 reserve in the escrow (for sale2).
    // We want to prevent signer 1 from colluding with signer 2 to withdraw
    // more funds from sale1 than were ever deposited for it. If this were
    // possible then malicious ISale contracts can steal from honest contracts.
    await rTKN
      .connect(signer1)
      .transfer(signer2.address, await rTKN.totalSupply());
    // This has to underflow here as signer2 is now trying to withdraw 1000
    // reserve tokens, which means 2000 reserve tokens total withdrawn from
    // sale1 vs. 1000 tokens deposited for sale1.
    await assertError(
      async () =>
        await rTKNClaimEscrow
          .connect(signer2)
          .withdraw(sale1.address, reserve.address, await rTKN.totalSupply()),
      "Error",
      "didn't prevent signer 2 from withdrawing from sale1 what was already withdrawn"
    );

    // However, it's entirely possible for signer2 to withdraw 1000 tokens
    // from sale2 as sale1 and sale2 share the same non-reserve token.
    await rTKNClaimEscrow
      .connect(signer2)
      .withdraw(sale2.address, reserve.address, await rTKN.totalSupply());

    assert(
      (await reserve.balanceOf(signer1.address)).eq(1000),
      `signer 1 has incorrect reserve.`
    );
    assert(
      (await reserve.balanceOf(signer2.address)).eq(1000),
      `signer 2 has incorrect reserve.`
    );
    assert(
      (await reserve.balanceOf(rTKNClaimEscrow.address)).eq(0),
      `escrow has incorrect reserve.`
    );
  });
});
