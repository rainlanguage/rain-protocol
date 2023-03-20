import hre, { ethers } from "hardhat";
import { delay, verifyAll } from "./utils";
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
  console.log(
    `\n----------- Deploying at ${hre.network.name.toUpperCase()} network -----------`
  );
  const [signer] = await ethers.getSigners();
  console.log("Signer deployer : ", signer.address);

  // Checking if the Registry1820 is already deployed in the chain and deploy if not.
  await deploy1820(signer);

  // Deploy the DISpair contracts (Rainterpreter, Store and Deployer)
  const { RainterpreterExpressionDeployer } = await deployDISpair();

  // Deploy CloneFactory
  const cloneFactory = await deployCloneFactory();

  // Deploy Flow (Basic)
  await deployFlow(RainterpreterExpressionDeployer);

  // Deploy FlowERC20
  await deployFlowErc20(RainterpreterExpressionDeployer);

  // Deploy FlowERC721
  await deployFlowErc721(RainterpreterExpressionDeployer);

  // Deploy FlowERC1155
  await deployFlowErc1155(RainterpreterExpressionDeployer);

  // Deploy FlowERC1155
  const timeoutDuration = 15000000;
  await deployLobby(RainterpreterExpressionDeployer, timeoutDuration);

  // Deploy OrderBook
  await deployOrderbook(RainterpreterExpressionDeployer);

  // Deploy Sale (and RedeemableERC20)
  const maximumSaleTimeout = 2592000; // Aprox 1 month
  await deploySale(
    RainterpreterExpressionDeployer,
    cloneFactory,
    maximumSaleTimeout
  );

  // Deploy Stake
  await deployStake(RainterpreterExpressionDeployer);

  // Deploy CombineTier
  await deployCombineTier(RainterpreterExpressionDeployer);

  // Deploy ReadWriteTier
  await deployReadWriteTier();

  // Deploy Verify
  await deployVerify();

  // Deploy AutoApprove
  await deployAutoApprove(RainterpreterExpressionDeployer);
}

let code: number;
main()
  .then(() => {
    code = 0;
  })
  .catch((error) => {
    console.error(error);
    code = 1;
  })
  .finally(async () => {
    // Wait 15sec before trying to Verify. That way, if the code was deployed,
    // it will be available for locate it.
    await delay(15000);

    // Verify all the contracts deployed (and print the results)
    // Using the finally sentence allow us to verify and print all the registered
    // contracts even if after some of them failed on deployment
    await verifyAll();

    const exit = process.exit;
    exit(code);
  });
