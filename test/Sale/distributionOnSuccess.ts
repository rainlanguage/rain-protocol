import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { ReadWriteTier } from "../../typechain/ReadWriteTier";
import { ReserveToken } from "../../typechain/ReserveToken";
import { SaleFactory } from "../../typechain/SaleFactory";
import { zeroAddress } from "../../utils/constants/address";
import { ONE, RESERVE_ONE } from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basic";
import { saleDependenciesDeploy, saleDeploy } from "../../utils/deploy/sale";
import { createEmptyBlock } from "../../utils/hardhat";
import { AllStandardOps } from "../../utils/rainvm/ops/allStandardOps";
import { betweenBlockNumbersSource } from "../../utils/rainvm/sale";
import { op, memoryOperand, MemoryType } from "../../utils/rainvm/vm";
import { Status } from "../../utils/types/sale";
import { Tier } from "../../utils/types/tier";

const Opcode = AllStandardOps;

describe("Sale distribution on successful sale", async function () {
  let reserve: ReserveToken,
    readWriteTier: ReadWriteTier,
    saleFactory: SaleFactory;

  before(async () => {
    ({ readWriteTier, saleFactory } = await saleDependenciesDeploy());
  });

  beforeEach(async () => {
    reserve = (await basicDeploy("ReserveToken", {})) as ReserveToken;
  });

  it("should transfer correct value to all stakeholders after successful sale (with forward address)", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const signer1 = signers[2];
    const feeRecipient = signers[3];
    const forwardingAddress = signers[4];
    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleDuration = 30;
    const minimumRaise = ethers.BigNumber.from("150000").mul(RESERVE_ONE);
    const totalTokenSupply = ethers.BigNumber.from("2000").mul(ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: zeroAddress,
      initialSupply: totalTokenSupply,
    };
    const staticPrice = ethers.BigNumber.from("75").mul(RESERVE_ONE);
    const constants = [
      staticPrice,
      startBlock - 1,
      startBlock + saleDuration - 1,
    ];
    const vBasePrice = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vStart = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const vEnd = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([op(Opcode.CONTEXT), vBasePrice]),
    ];
    const [sale, token] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        vmStateConfig: {
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
        distributionEndForwardingAddress: forwardingAddress.address,
      }
    );
    const fee = ethers.BigNumber.from("1").mul(RESERVE_ONE);
    // wait until sale start
    await createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );
    await sale.start();
    const desiredUnits = totalTokenSupply; // all
    const cost = staticPrice.mul(desiredUnits).div(ONE);
    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, cost.add(fee));
    await reserve
      .connect(signer1)
      .approve(sale.address, staticPrice.mul(desiredUnits).add(fee));
    const tokenSupply0 = await token.totalSupply();
    const saleTokenBalance0 = await token.balanceOf(sale.address);
    const signer1TokenBalance0 = await token.balanceOf(signer1.address);
    const saleReserveBalance0 = await reserve.balanceOf(sale.address);
    const recipientReserveBalance0 = await reserve.balanceOf(recipient.address);
    const feeRecipientReserveBalance0 = await reserve.balanceOf(
      feeRecipient.address
    );
    assert(tokenSupply0.eq(totalTokenSupply));
    assert(
      saleTokenBalance0.eq(tokenSupply0),
      "sale should initially hold all rTKN"
    );
    assert(signer1TokenBalance0.isZero());
    assert(saleReserveBalance0.isZero());
    assert(recipientReserveBalance0.isZero());
    assert(feeRecipientReserveBalance0.isZero());
    // buy all units
    await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnits,
      desiredUnits,
      maximumPrice: staticPrice,
    });
    // sale should have ended
    const saleStatusSuccess = await sale.saleStatus();
    assert(
      saleStatusSuccess === Status.SUCCESS,
      `wrong status in getter
      expected  ${Status.SUCCESS}
      got       ${saleStatusSuccess}`
    );
    // if distributionEndForwardingAddress, should forward distributor (sale) rTKN balance
    //// else, should burn distributor (sale) rTKN balance
    // if successful sale, transfer all reserve to recipient
    const tokenSupply1 = await token.totalSupply();
    const saleTokenBalance1 = await token.balanceOf(sale.address);
    const signer1TokenBalance1 = await token.balanceOf(signer1.address);
    const saleReserveBalance1 = await reserve.balanceOf(sale.address);
    const recipientReserveBalance1 = await reserve.balanceOf(recipient.address);
    const feeRecipientReserveBalance1 = await reserve.balanceOf(
      feeRecipient.address
    );
    assert(
      tokenSupply1.eq(tokenSupply0),
      "total rTKN supply should be unchanged as signer1 bought all units, hence none was transferred to forwarding address"
    );
    assert(saleTokenBalance1.isZero(), "all rTKN units should have been sold");
    assert(
      signer1TokenBalance1.eq(saleTokenBalance0),
      "signer1 should hold all sold rTKN units"
    );
    assert(saleReserveBalance1.eq(fee));
    assert(recipientReserveBalance1.eq(cost));
    assert(
      feeRecipientReserveBalance1.isZero(),
      "fee recipient should not have received fees before claiming"
    );
    await sale.claimFees(feeRecipient.address);
    const saleReserveBalance2 = await reserve.balanceOf(sale.address);
    const feeRecipientReserveBalance2 = await reserve.balanceOf(
      feeRecipient.address
    );
    assert(
      saleReserveBalance2.isZero(),
      "sale should have transferred all claimed reserve to fee recipient"
    );
    assert(
      feeRecipientReserveBalance2.eq(fee),
      "fee recipient should have received fees after claiming"
    );
  });

  it("should transfer correct value to all stakeholders after successful sale (no forward address)", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const signer1 = signers[2];
    const feeRecipient = signers[3];
    // 5 blocks from now
    const startBlock = (await ethers.provider.getBlockNumber()) + 5;
    const saleDuration = 30;
    const minimumRaise = ethers.BigNumber.from("100000").mul(RESERVE_ONE);
    const totalTokenSupply = ethers.BigNumber.from("2000").mul(ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: zeroAddress,
      initialSupply: totalTokenSupply,
    };
    const staticPrice = ethers.BigNumber.from("75").mul(RESERVE_ONE);
    const constants = [
      staticPrice,
      startBlock - 1,
      startBlock + saleDuration - 1,
    ];
    const vBasePrice = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vStart = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const vEnd = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const sources = [
      betweenBlockNumbersSource(vStart, vEnd),
      concat([op(Opcode.CONTEXT), vBasePrice]),
    ];
    const [sale, token] = await saleDeploy(
      signers,
      deployer,
      saleFactory,
      {
        vmStateConfig: {
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
    const fee = ethers.BigNumber.from("1").mul(RESERVE_ONE);
    // wait until sale start
    await createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );
    await sale.start();
    const desiredUnits = totalTokenSupply; // all
    const cost = staticPrice.mul(desiredUnits).div(ONE);
    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, cost.add(fee));
    await reserve
      .connect(signer1)
      .approve(sale.address, staticPrice.mul(desiredUnits).add(fee));
    const tokenSupply0 = await token.totalSupply();
    const saleTokenBalance0 = await token.balanceOf(sale.address);
    const signer1TokenBalance0 = await token.balanceOf(signer1.address);
    const saleReserveBalance0 = await reserve.balanceOf(sale.address);
    const recipientReserveBalance0 = await reserve.balanceOf(recipient.address);
    const feeRecipientReserveBalance0 = await reserve.balanceOf(
      feeRecipient.address
    );
    assert(tokenSupply0.eq(totalTokenSupply));
    assert(
      saleTokenBalance0.eq(tokenSupply0),
      "sale should initially hold all rTKN"
    );
    assert(signer1TokenBalance0.isZero());
    assert(saleReserveBalance0.isZero());
    assert(recipientReserveBalance0.isZero());
    assert(feeRecipientReserveBalance0.isZero());
    // buy all units
    await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnits,
      desiredUnits,
      maximumPrice: staticPrice,
    });
    // sale should have ended
    const saleStatusSuccess = await sale.saleStatus();
    assert(
      saleStatusSuccess === Status.SUCCESS,
      `wrong status in getter
      expected  ${Status.SUCCESS}
      got       ${saleStatusSuccess}`
    );
    //// if distributionEndForwardingAddress, should forward distributor (sale) rTKN balance
    // else, should burn distributor (sale) rTKN balance
    // if successful sale, transfer all reserve to recipient
    const tokenSupply1 = await token.totalSupply();
    const saleTokenBalance1 = await token.balanceOf(sale.address);
    const signer1TokenBalance1 = await token.balanceOf(signer1.address);
    const saleReserveBalance1 = await reserve.balanceOf(sale.address);
    const recipientReserveBalance1 = await reserve.balanceOf(recipient.address);
    const feeRecipientReserveBalance1 = await reserve.balanceOf(
      feeRecipient.address
    );
    assert(
      tokenSupply1.eq(tokenSupply0),
      "total rTKN supply should be unchanged as signer1 bought all units, hence none was burned"
    );
    assert(saleTokenBalance1.isZero(), "all rTKN units should have been sold");
    assert(
      signer1TokenBalance1.eq(saleTokenBalance0),
      "signer1 should hold all sold rTKN units"
    );
    assert(saleReserveBalance1.eq(fee));
    assert(recipientReserveBalance1.eq(cost));
    assert(
      feeRecipientReserveBalance1.isZero(),
      "fee recipient should not have received fees before claiming"
    );
    await sale.claimFees(feeRecipient.address);
    const saleReserveBalance2 = await reserve.balanceOf(sale.address);
    const feeRecipientReserveBalance2 = await reserve.balanceOf(
      feeRecipient.address
    );
    assert(
      saleReserveBalance2.isZero(),
      "sale should have transferred all claimed reserve to fee recipient"
    );
    assert(
      feeRecipientReserveBalance2.eq(fee),
      "fee recipient should have received fees after claiming"
    );
  });
});
