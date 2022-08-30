/* eslint-disable @typescript-eslint/no-var-requires */
import { ethers } from "hardhat";
import type {
  ReadWriteTier,
  RedeemableERC20ClaimEscrow,
  SaleFactory,
} from "../../typechain";
import {
  RedeemableERC20ClaimEscrowWrapper,
  RedeemableERC20Factory,
} from "../../typechain";
import { SaleConstructorConfigStruct } from "../../typechain/contracts/sale/Sale";

export const deployGlobals = async () => {
  const integrityFactory = await ethers.getContractFactory("StandardIntegrity");
  const integrity = await integrityFactory.deploy();
  await integrity.deployed();

  const tierFactory = await ethers.getContractFactory("ReadWriteTier");
  const readWriteTier = (await tierFactory.deploy()) as ReadWriteTier;

  const redeemableERC20FactoryFactory = await ethers.getContractFactory(
    "RedeemableERC20Factory",
    {}
  );
  const redeemableERC20Factory =
    (await redeemableERC20FactoryFactory.deploy()) as RedeemableERC20Factory;
  await redeemableERC20Factory.deployed();

  const saleConstructorConfig: SaleConstructorConfigStruct = {
    maximumSaleTimeout: 1000,
    maximumCooldownDuration: 1000,
    redeemableERC20Factory: redeemableERC20Factory.address,
    vmIntegrity: integrity.address,
  };

  const saleFactoryFactory = await ethers.getContractFactory("SaleFactory");
  const saleFactory = (await saleFactoryFactory.deploy(
    saleConstructorConfig
  )) as SaleFactory;

  // Deploy global Claim contract
  const claimFactory = await ethers.getContractFactory(
    "RedeemableERC20ClaimEscrow"
  );
  const claim = (await claimFactory.deploy()) as RedeemableERC20ClaimEscrow;

  // Deploy wrapped Claim version (accessors)
  const claimWrapperFactory = await ethers.getContractFactory(
    "RedeemableERC20ClaimEscrowWrapper"
  );
  const claimWrapper =
    (await claimWrapperFactory.deploy()) as RedeemableERC20ClaimEscrowWrapper;

  return {
    tierFactory,
    readWriteTier,
    claimFactory,
    claim,
    claimWrapperFactory,
    claimWrapper,
    saleFactoryFactory,
    saleFactory,
  };
};
