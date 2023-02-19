/* eslint-disable @typescript-eslint/no-var-requires */
import { ethers } from "hardhat";
import type {
  RainterpreterExpressionDeployer,
  RedeemableERC20ClaimEscrow,
} from "../../../../typechain";
import { RedeemableERC20ClaimEscrowWrapper } from "../../../../typechain";
import { InterpreterCallerV1ConstructionConfigStruct } from "../../../../typechain/contracts/flow/FlowCommon";
import { SaleConstructorConfigStruct } from "../../../../typechain/contracts/sale/Sale";
import { getRainContractMetaBytes } from "../../../meta";
import { getTouchDeployer } from "../../interpreter/shared/rainterpreterExpressionDeployer/deploy";
import { redeemableERC20FactoryDeploy } from "../../redeemableERC20/redeemableERC20Factory/deploy";
import { saleFactoryDeploy } from "../../sale/saleFactory/deploy";
import { readWriteTierDeploy } from "../../tier/readWriteTier/deploy";

export const escrowDeploy = async () => {
  const readWriteTier = await readWriteTierDeploy();
  const redeemableERC20Factory = await redeemableERC20FactoryDeploy();
  const touchDeployer: RainterpreterExpressionDeployer =
    await getTouchDeployer();

  const config_: InterpreterCallerV1ConstructionConfigStruct = {
    callerMeta: getRainContractMetaBytes("sale"),
    deployer: touchDeployer.address,
  };

  const saleConstructorConfig: SaleConstructorConfigStruct = {
    maximumSaleTimeout: 1000,
    redeemableERC20Factory: redeemableERC20Factory.address,
    interpreterCallerConfig: config_,
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
