/* eslint-disable @typescript-eslint/no-var-requires */
import { ethers } from "hardhat";
import type { RedeemableERC20ClaimEscrow } from "../../../../typechain";
import { RedeemableERC20ClaimEscrowWrapper } from "../../../../typechain";
import { SaleConstructorConfigStruct } from "../../../../typechain/contracts/sale/Sale";
import { redeemableERC20FactoryDeploy } from "../../redeemableERC20/redeemableERC20Factory/deploy";
import { saleFactoryDeploy } from "../../sale/saleFactory/deploy";
import { readWriteTierDeploy } from "../../tier/readWriteTier/deploy";

export const escrowDeploy = async () => {
  const readWriteTier = await readWriteTierDeploy();
  const redeemableERC20Factory = await redeemableERC20FactoryDeploy();

  const saleConstructorConfig: SaleConstructorConfigStruct = {
    maximumSaleTimeout: 1000,
    redeemableERC20Factory: redeemableERC20Factory.address,
  };

  const saleFactory = await saleFactoryDeploy(saleConstructorConfig);

  // Deploy global Claim contract
  const claimFactory = await ethers.getContractFactory(
    "RedeemableERC20ClaimEscrow"
  );
  const claim = (await claimFactory.deploy()) as RedeemableERC20ClaimEscrow;
  await claim.deployed();

  // Deploy wrapped Claim version (accessors)
  const claimWrapperFactory = await ethers.getContractFactory(
    "RedeemableERC20ClaimEscrowWrapper"
  );
  const claimWrapper =
    (await claimWrapperFactory.deploy()) as RedeemableERC20ClaimEscrowWrapper;
  await claimWrapper.deployed();

  return {
    readWriteTier,
    claimFactory,
    claim,
    claimWrapperFactory,
    claimWrapper,
    saleFactory,
  };
};
