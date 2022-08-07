import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { ReadWriteTier } from "../../../typechain/ReadWriteTier";
import { ReserveToken } from "../../../typechain/ReserveToken";
import { SaleFactory } from "../../../typechain/SaleFactory";
import { zeroAddress } from "../../../utils/constants/address";
import { ONE, RESERVE_ONE } from "../../../utils/constants/bigNumber";
import { basicDeploy } from "../../../utils/deploy/basic";
import { saleDependenciesDeploy, saleDeploy } from "../../../utils/deploy/sale";
import { createEmptyBlock } from "../../../utils/hardhat";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { betweenBlockNumbersSource } from "../../../utils/rainvm/sale";
import { op, memoryOperand, MemoryType } from "../../../utils/rainvm/vm";
import { assertError } from "../../../utils/test/assertError";
import { Phase } from "../../../utils/types/redeemableERC20";
import { Status } from "../../../utils/types/sale";
import { Tier } from "../../../utils/types/tier";

const Opcode = AllStandardOps;

describe("Sale redeemableERC20 token", async function () {
  let reserve: ReserveToken,
    readWriteTier: ReadWriteTier,
    saleFactory: SaleFactory;

  before(async () => {
    ({ readWriteTier, saleFactory } = await saleDependenciesDeploy());
  });

  beforeEach(async () => {
    reserve = (await basicDeploy("ReserveToken", {})) as ReserveToken;
    await reserve.initialize()
  });

  it("should configure tier correctly", async () => {
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
    const minimumTier = Tier.FOUR;

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
        minimumTier,
        distributionEndForwardingAddress: forwardingAddress.address,
      }
    );
    assert(
      (await token.minimumTier()).eq(minimumTier),
      "wrong tier level set on token"
    );
    const fee = ethers.BigNumber.from("1").mul(RESERVE_ONE);
    // wait until sale start
    await createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );
    await sale.start();
    const desiredUnits = totalTokenSupply.div(2); // not all
    const cost = staticPrice.mul(desiredUnits).div(ONE);
    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, cost.add(fee));
    await reserve
      .connect(signer1)
      .approve(sale.address, staticPrice.mul(desiredUnits).add(fee));
    // attempt to buy all units
    await assertError(
      async () =>
        await sale.connect(signer1).buy({
          feeRecipient: feeRecipient.address,
          fee,
          minimumUnits: desiredUnits,
          desiredUnits,
          maximumPrice: staticPrice,
        }),
      "MIN_TIER",
      "singer1 bought units from Sale without meeting minimum tier requirement"
    );
    await readWriteTier.setTier(signer1.address, Tier.FOUR, []);
    // buy all units
    await sale.connect(signer1).buy({
      feeRecipient: feeRecipient.address,
      fee,
      minimumUnits: desiredUnits,
      desiredUnits,
      maximumPrice: staticPrice,
    });
    // wait until sale can end
    await createEmptyBlock(
      saleDuration + startBlock - (await ethers.provider.getBlockNumber())
    );
    const forwardingAddressTokenBalance0 = await token.balanceOf(
      forwardingAddress.address
    );
    await sale.end();
    const forwardingAddressTokenBalance1 = await token.balanceOf(
      forwardingAddress.address
    );
    assert(
      forwardingAddressTokenBalance1.gt(forwardingAddressTokenBalance0),
      "forwarding address should bypass tier restrictions"
    );
  });

  it("should set correct phases for token", async () => {
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
    const saleStatus0 = await sale.saleStatus();
    const tokenPhase0 = await token.currentPhase();
    assert(saleStatus0 === Status.PENDING);
    assert(tokenPhase0.eq(Phase.DISTRIBUTING));
    const fee = ethers.BigNumber.from("1").mul(RESERVE_ONE);
    // wait until sale start
    await createEmptyBlock(
      startBlock - (await ethers.provider.getBlockNumber())
    );
    await sale.start();
    const saleStatus1 = await sale.saleStatus();
    const tokenPhase1 = await token.currentPhase();
    assert(saleStatus1 === Status.ACTIVE);
    assert(tokenPhase1.eq(Phase.DISTRIBUTING));
    const desiredUnits = totalTokenSupply; // all
    const cost = staticPrice.mul(desiredUnits).div(ONE);
    // give signer1 reserve to cover cost + fee
    await reserve.transfer(signer1.address, cost.add(fee));
    await reserve
      .connect(signer1)
      .approve(sale.address, staticPrice.mul(desiredUnits).add(fee));
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
    const saleStatus2 = await sale.saleStatus();
    const tokenPhase2 = await token.currentPhase();
    assert(saleStatus2 === Status.SUCCESS);
    assert(tokenPhase2.eq(Phase.FROZEN));
  });

  it("should allow only token admin (Sale) to set senders/receivers", async () => {
    // At the time of writing this test, Sale does not currently implement any logic which grants sender or receiver roles.
    // However, it is still important that only the token admin can grant these roles.

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const recipient = signers[1];
    const signer1 = signers[2];
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
    const [, token] = await saleDeploy(
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
    // deployer cannot add receiver
    await assertError(
      async () => await token.connect(deployer).grantReceiver(deployer.address),
      "ONLY_ADMIN",
      "deployer added receiver, despite not being token admin"
    );
    // deployer cannot add sender
    await assertError(
      async () => await token.connect(deployer).grantSender(deployer.address),
      "ONLY_ADMIN",
      "deployer added sender, despite not being token admin"
    );
    // anon cannot add receiver
    await assertError(
      async () => await token.connect(signer1).grantReceiver(signer1.address),
      "ONLY_ADMIN",
      "anon added receiver, despite not being token admin"
    );
    // anon cannot add sender
    await assertError(
      async () => await token.connect(signer1).grantSender(signer1.address),
      "ONLY_ADMIN",
      "anon added sender, despite not being token admin"
    );
  });
});
