import { assert } from "chai";
import { hexlify, randomBytes } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { RedeemableERC20 } from "../../../typechain";
import {
  IERC20Upgradeable as IERC20,
  MockISaleV2,
  ReadWriteTier,
  ReserveToken,
  SaleEscrowWrapper,
} from "../../../typechain";
import { zeroAddress } from "../../../utils/constants/address";
import { ONE } from "../../../utils/constants/bigNumber";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import { redeemableERC20Deploy } from "../../../utils/deploy/redeemableERC20/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
import { reserveDeploy } from "../../../utils/deploy/test/reserve/deploy";
import { readWriteTierDeploy } from "../../../utils/deploy/tier/readWriteTier/deploy";
import { Status } from "../../../utils/types/sale";
import { EscrowStatus, SaleStatus } from "../../../utils/types/saleEscrow";

let reserve: ReserveToken, readWriteTier: ReadWriteTier;

describe("SaleEscrow unchangeable addresses", async function () {
  beforeEach(async () => {
    reserve = await reserveDeploy();
  });

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    readWriteTier = await readWriteTierDeploy();
  });

  it("should return reserve and token addresses, and escrow status of Pending, after Sale initialisation", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const totalTokenSupply = ethers.BigNumber.from("2000").mul(ONE);
    const redeemableERC20Config = {
      name: "Token",
      symbol: "TKN",
      distributor: deployer.address,
      initialSupply: totalTokenSupply,
    };
    const redeemableERC20 = (await redeemableERC20Deploy(deployer, {
      reserve: reserve.address,
      erc20Config: redeemableERC20Config,
      tier: readWriteTier.address,
      minimumTier: 0,
      distributionEndForwardingAddress: zeroAddress,
    })) as RedeemableERC20;

    const sale = (await basicDeploy("MockISaleV2", {})) as MockISaleV2;

    await sale.setReserve(reserve.address);
    await sale.setToken(redeemableERC20.address);
    await sale.setSaleStatus(Status.PENDING);

    const saleReserve = await sale.reserve();
    const saleToken = await sale.token();
    const saleStatus: SaleStatus = await sale.saleStatus();

    // sanity check
    assert(saleStatus === SaleStatus.Pending, "wrong sale status: not Pending");

    const saleEscrowWrapper = (await basicDeploy(
      "SaleEscrowWrapper",
      {}
    )) as SaleEscrowWrapper;

    await saleEscrowWrapper.fetchReserve(sale.address);
    await saleEscrowWrapper.fetchToken(sale.address);
    await saleEscrowWrapper.fetchEscrowStatus(sale.address);

    const saleEscrowReserve = await saleEscrowWrapper.getReserve(sale.address);
    const saleEscrowToken = await saleEscrowWrapper.getToken(sale.address);
    const saleEscrowStatus: EscrowStatus =
      await saleEscrowWrapper.getEscrowStatus(sale.address);

    assert(
      saleReserve === saleEscrowReserve,
      "sale escrow fetched incorrect reserve address"
    );
    assert(
      saleToken === saleEscrowToken,
      "sale escrow fetched incorrect token address"
    );
    assert(
      saleEscrowStatus === EscrowStatus.Pending,
      "wrong sale escrow status: not Pending"
    );
  });

  it("should prevent 'malicious' sale contract from modifying reserve and token addresses", async function () {
    const sale = (await basicDeploy("MockISaleV2", {})) as MockISaleV2;

    const saleEscrowWrapper = (await basicDeploy(
      "SaleEscrowWrapper",
      {}
    )) as SaleEscrowWrapper;

    const tokenFactory = await ethers.getContractFactory("ReserveToken");
    const reserve = (await tokenFactory.deploy()) as ReserveToken;
    await reserve.initialize();
    const rTKN = (await tokenFactory.deploy()) as IERC20;

    await reserve.deployed();
    await rTKN.deployed();

    await sale.setReserve(reserve.address);
    await sale.setToken(rTKN.address);
    await sale.setSaleStatus(SaleStatus.Success);

    // sale escrow indexes reserve and token addresses, and escrow status
    await saleEscrowWrapper.fetchReserve(sale.address);
    await saleEscrowWrapper.fetchToken(sale.address);
    await saleEscrowWrapper.fetchEscrowStatus(sale.address);

    const saleEscrowReserve0 = await saleEscrowWrapper.getReserve(sale.address);
    const saleEscrowToken0 = await saleEscrowWrapper.getToken(sale.address);

    const newReserve = hexlify(randomBytes(20));
    const newToken = hexlify(randomBytes(20));

    await sale.setReserve(newReserve);
    await sale.setToken(newToken);

    await saleEscrowWrapper.fetchReserve(sale.address);
    await saleEscrowWrapper.fetchToken(sale.address);

    const saleEscrowReserve1 = await saleEscrowWrapper.getReserve(sale.address);
    const saleEscrowToken1 = await saleEscrowWrapper.getToken(sale.address);

    // sanity check
    assert(
      saleEscrowReserve0 !== newReserve,
      "for some miraculous reason the new reserve has same address as original reserve"
    );
    assert(
      saleEscrowReserve0 === saleEscrowReserve1,
      "sale escrow wrongly updated reserve address"
    );

    // sanity check
    assert(
      saleEscrowToken0 !== newToken,
      "for some miraculous reason the new token has same address as original token"
    );
    assert(
      saleEscrowToken0 === saleEscrowToken1,
      "sale escrow wrongly updated token address"
    );
  });

  it("should prevent 'malicious' sale contract from modifying fail status", async function () {
    const sale = (await basicDeploy("MockISaleV2", {})) as MockISaleV2;

    const saleEscrowWrapper = (await basicDeploy(
      "SaleEscrowWrapper",
      {}
    )) as SaleEscrowWrapper;

    const tokenFactory = await ethers.getContractFactory("ReserveToken");
    const reserve = (await tokenFactory.deploy()) as ReserveToken;
    await reserve.initialize();
    const rTKN = (await tokenFactory.deploy()) as IERC20;

    await reserve.deployed();
    await rTKN.deployed();

    await sale.setReserve(reserve.address);
    await sale.setToken(rTKN.address);
    await sale.setSaleStatus(SaleStatus.Pending);

    await saleEscrowWrapper.fetchEscrowStatus(sale.address);
    const saleEscrowStatus0: EscrowStatus =
      await saleEscrowWrapper.getEscrowStatus(sale.address);

    assert(
      saleEscrowStatus0 === EscrowStatus.Pending,
      "wrong escrow status: not Pending"
    );

    await sale.setSaleStatus(SaleStatus.Active);
    await saleEscrowWrapper.fetchEscrowStatus(sale.address);
    const saleEscrowStatus1: EscrowStatus =
      await saleEscrowWrapper.getEscrowStatus(sale.address);

    assert(
      saleEscrowStatus1 === EscrowStatus.Pending,
      "wrong escrow status: not Pending"
    );

    await sale.setSaleStatus(SaleStatus.Fail);
    await saleEscrowWrapper.fetchEscrowStatus(sale.address);
    const saleEscrowStatus2: EscrowStatus =
      await saleEscrowWrapper.getEscrowStatus(sale.address);

    assert(
      saleEscrowStatus2 === EscrowStatus.Fail,
      "wrong escrow status: not Failed"
    );

    await sale.setSaleStatus(SaleStatus.Success);
    await saleEscrowWrapper.fetchEscrowStatus(sale.address);
    const saleEscrowStatus3: EscrowStatus =
      await saleEscrowWrapper.getEscrowStatus(sale.address);

    assert(
      saleEscrowStatus3 === EscrowStatus.Fail,
      "wrong escrow status: not Failed"
    );
  });

  it("should prevent 'malicious' sale contract from modifying success status", async function () {
    const sale = (await basicDeploy("MockISaleV2", {})) as MockISaleV2;

    const saleEscrowWrapper = (await basicDeploy(
      "SaleEscrowWrapper",
      {}
    )) as SaleEscrowWrapper;

    const tokenFactory = await ethers.getContractFactory("ReserveToken");
    const reserve = (await tokenFactory.deploy()) as IERC20;
    const rTKN = (await tokenFactory.deploy()) as IERC20;

    await reserve.deployed();
    await rTKN.deployed();

    await sale.setReserve(reserve.address);
    await sale.setToken(rTKN.address);
    await sale.setSaleStatus(SaleStatus.Pending);

    await saleEscrowWrapper.fetchEscrowStatus(sale.address);
    const saleEscrowStatus0: EscrowStatus =
      await saleEscrowWrapper.getEscrowStatus(sale.address);

    assert(
      saleEscrowStatus0 === EscrowStatus.Pending,
      "wrong escrow status: not Pending"
    );

    await sale.setSaleStatus(SaleStatus.Active);
    await saleEscrowWrapper.fetchEscrowStatus(sale.address);
    const saleEscrowStatus1: EscrowStatus =
      await saleEscrowWrapper.getEscrowStatus(sale.address);

    assert(
      saleEscrowStatus1 === EscrowStatus.Pending,
      "wrong escrow status: not Pending"
    );

    await sale.setSaleStatus(SaleStatus.Success);
    await saleEscrowWrapper.fetchEscrowStatus(sale.address);
    const saleEscrowStatus2: EscrowStatus =
      await saleEscrowWrapper.getEscrowStatus(sale.address);

    assert(
      saleEscrowStatus2 === EscrowStatus.Success,
      "wrong escrow status: not Success"
    );

    await sale.setSaleStatus(SaleStatus.Fail);
    await saleEscrowWrapper.fetchEscrowStatus(sale.address);
    const saleEscrowStatus3: EscrowStatus =
      await saleEscrowWrapper.getEscrowStatus(sale.address);

    assert(
      saleEscrowStatus3 === EscrowStatus.Success,
      "wrong escrow status: not Success"
    );
  });
});
