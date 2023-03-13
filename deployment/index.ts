import { ethers } from "hardhat";
import { printAllAddresses } from "./utils";
import deploy1820 from "../utils/deploy/registry1820/deploy";
import {
  deployDISpair,
  deployFlow,
  deployFlowErc20,
  deployFlowErc721,
  deployFlowErc1155,
  deployLobby,
  deployOrderbook,
  deployCloneFactory,
  deploySale,
  deployStake,
  deployCombineTier,
  deployReadWriteTier,
  deployVerify,
  deployAutoApprove,
} from "./deploy";

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Signer deployer : ", signer.address);

  // Checking if the Registry1820 is already deployed in the chain and deploy if not.
  await deploy1820(signer);

  // Deploy the DISpair contracts (Rainterpreter, Store and Deployer)
  const { ExpressionDeployer } = await deployDISpair();

  // Deploy CloneFactory
  const cloneFactory = await deployCloneFactory();

  // Deploy Flow (Basic)
  await deployFlow(ExpressionDeployer);

  // Deploy FlowERC20
  await deployFlowErc20(ExpressionDeployer);

  // Deploy FlowERC721
  await deployFlowErc721(ExpressionDeployer);

  // Deploy FlowERC1155
  await deployFlowErc1155(ExpressionDeployer);

  // Deploy FlowERC1155
  const timeoutDuration = 15000000;
  await deployLobby(ExpressionDeployer, timeoutDuration);

  // Deploy OrderBook
  await deployOrderbook(ExpressionDeployer);

  // Deploy Sale (and RedeemableERC20)
  const maximumSaleTimeout = 2592000; // Aprox 1 month
  await deploySale(ExpressionDeployer, cloneFactory, maximumSaleTimeout);

  // Deploy Stake
  await deployStake(ExpressionDeployer);

  // Deploy CombineTier
  await deployCombineTier(ExpressionDeployer);

  // Deploy ReadWriteTier
  await deployReadWriteTier();

  // Deploy Verify
  await deployVerify();

  // Deploy AutoApprove
  await deployAutoApprove(ExpressionDeployer);

  // Print all the addresses deployed
  printAllAddresses();
}

main()
  .then(() => {
    const exit = process.exit;
    exit(0);
  })
  .catch((error) => {
    console.error(error);
    const exit = process.exit;
    exit(1);
  });
