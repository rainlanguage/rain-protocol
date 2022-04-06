/* eslint-disable @typescript-eslint/no-var-requires */
import * as Util from "../Util";
import { ethers } from "hardhat";
import type { RedeemableERC20ClaimEscrow } from "../../typechain/RedeemableERC20ClaimEscrow";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import type { Contract } from "ethers";
import type {
  SaleConstructorConfigStruct,
  SaleFactory,
} from "../../typechain/SaleFactory";
import { RedeemableERC20ClaimEscrowWrapper } from "../../typechain/RedeemableERC20ClaimEscrowWrapper";
import { RedeemableERC20Factory } from "../../typechain/RedeemableERC20Factory";

export const deployGlobals = async () => {
  const tierFactory = await ethers.getContractFactory("ReadWriteTier");
  const readWriteTier = (await tierFactory.deploy()) as ReadWriteTier &
    Contract;

  const redeemableERC20FactoryFactory = await ethers.getContractFactory(
    "RedeemableERC20Factory",
    {}
  );
  const redeemableERC20Factory =
    (await redeemableERC20FactoryFactory.deploy()) as RedeemableERC20Factory &
      Contract;
  await redeemableERC20Factory.deployed();

  const saleConstructorConfig: SaleConstructorConfigStruct = {
    maximumSaleTimeout: 1000,
    maximumCooldownDuration: 1000,
    redeemableERC20Factory: redeemableERC20Factory.address,
  };

  const saleFactoryFactory = await ethers.getContractFactory("SaleFactory");
  const saleFactory = (await saleFactoryFactory.deploy(
    saleConstructorConfig
  )) as SaleFactory & Contract;

  // Deploy global Claim contract
  const claimFactory = await ethers.getContractFactory(
    "RedeemableERC20ClaimEscrow"
  );
  const claim = (await claimFactory.deploy()) as RedeemableERC20ClaimEscrow &
    Contract;

  // Deploy wrapped Claim version (accessors)
  const claimWrapperFactory = await ethers.getContractFactory(
    "RedeemableERC20ClaimEscrowWrapper"
  );
  const claimWrapper =
    (await claimWrapperFactory.deploy()) as RedeemableERC20ClaimEscrowWrapper &
      Contract;

  return {
    tierFactory,
    readWriteTier,
    saleFactory,
    claimFactory,
    claim,
    claimWrapperFactory,
    claimWrapper,
    redeemableERC20Factory,
  };
};
