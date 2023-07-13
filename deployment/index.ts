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

  // Deploy Flow (Basic)
  try {
    await deployFlow(RainterpreterExpressionDeployer);
  } catch (error) {
    console.log("Error in deployFlow");
    console.log(error);
  }

  // Deploy FlowERC20
  try {
    await deployFlowErc20(RainterpreterExpressionDeployer);
  } catch (error) {
    console.log("Error in deployFlowErc20");
    console.log(error);
  }

  // Deploy FlowERC721
  try {
    await deployFlowErc721(RainterpreterExpressionDeployer);
  } catch (error) {
    console.log("Error in deployFlowErc721");
    console.log(error);
  }

  // Deploy FlowERC1155
  try {
    await deployFlowErc1155(RainterpreterExpressionDeployer);
  } catch (error) {
    console.log("Error in deployFlowErc1155");
    console.log(error);
  }

  // Deploy Lobby
  try {
    const timeoutDuration = 15000000;
    await deployLobby(RainterpreterExpressionDeployer, timeoutDuration);
  } catch (error) {
    console.log("Error in deployLobby");
    console.log(error);
  }

  // Deploy OrderBook
  try {
    await deployOrderbook(RainterpreterExpressionDeployer);
  } catch (error) {
    console.log("Error in deployOrderbook");
    console.log(error);
  }

  //
  // // Deploy Sale (and RedeemableERC20)
  // const maximumSaleTimeout = 2592000; // Aprox 1 month
  // await deploySale(
  //   RainterpreterExpressionDeployer,
  //   cloneFactory,
  //   maximumSaleTimeout
  // );

  // Deploy Stake
  try {
    await deployStake(RainterpreterExpressionDeployer);
  } catch (error) {
    console.log("Error in deployStake");
    console.log(error);
  }

  // Deploy CombineTier
  try {
    await deployCombineTier(RainterpreterExpressionDeployer);
  } catch (error) {
    console.log("Error in deployCombineTier");
    console.log(error);
  }

  // Deploy ReadWriteTier
  try {
    await deployReadWriteTier();
  } catch (error) {
    console.log("Error in deployReadWriteTier");
    console.log(error);
  }

  // Deploy Verify
  try {
    await deployVerify();
  } catch (error) {
    console.log("Error in deployVerify");
    console.log(error);
  }

  // Deploy AutoApprove
  try {
    await deployAutoApprove(RainterpreterExpressionDeployer);
  } catch (error) {
    console.log("Error in deployAutoApprove");
    console.log(error);
  }
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
