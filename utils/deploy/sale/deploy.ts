import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { Overrides } from "ethers";
import { artifacts, ethers } from "hardhat";
import { RedeemableERC20, Sale, SaleFactory } from "../../../typechain";
import {
  ConstructEvent,
  SaleConfigStruct,
  SaleConstructorConfigStruct,
  SaleRedeemableERC20ConfigStruct,
} from "../../../typechain/contracts/sale/Sale";
import { getEventArgs } from "../../events";
import { rainterpreterExpressionDeployerDeploy } from "../interpreter/shared/rainterpreterExpressionDeployer/deploy";
import { rainterpreterDeploy } from "../interpreter/shared/rainterpreter/deploy";
import { redeemableERC20FactoryDeploy } from "../redeemableERC20/redeemableERC20Factory/deploy";
import { readWriteTierDeploy } from "../tier/readWriteTier/deploy";
import { saleFactoryDeploy } from "./saleFactory/deploy";

export const saleDeploy = async (
  signers: SignerWithAddress[],
  deployer: SignerWithAddress,
  saleFactory: SaleFactory,
  config: SaleConfigStruct,
  saleRedeemableERC20Config: SaleRedeemableERC20ConfigStruct,
  ...args: Overrides[]
): Promise<[Sale, RedeemableERC20]> => {
  const txDeploy = await saleFactory.createChildTyped(
    config,
    saleRedeemableERC20Config,
    ...args
  );

  const sale = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(txDeploy, "NewChild", saleFactory)).child
      ),
      20 // address bytes length
    ),
    (await artifacts.readArtifact("Sale")).abi,
    deployer
  ) as Sale;

  if (!ethers.utils.isAddress(sale.address)) {
    throw new Error(
      `invalid sale address: ${sale.address} (${sale.address.length} chars)`
    );
  }

  await sale.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  sale.deployTransaction = txDeploy;

  let token = new ethers.Contract(
    await sale.token(),
    (await artifacts.readArtifact("RedeemableERC20")).abi
  ) as RedeemableERC20;

  token = token.connect(signers[0]); // need to do this for some reason

  return [sale, token];
};

export const saleDependenciesDeploy = async () => {
  const redeemableERC20Factory = await redeemableERC20FactoryDeploy();
  const readWriteTier = await readWriteTierDeploy();

  const saleConstructorConfig: SaleConstructorConfigStruct = {
    maximumSaleTimeout: 10000,
    redeemableERC20Factory: redeemableERC20Factory.address,
  };

  const saleFactory = await saleFactoryDeploy(saleConstructorConfig);

  const { implementation, sender } = await getEventArgs(
    saleFactory.deployTransaction,
    "Implementation",
    saleFactory
  );

  assert(sender === (await ethers.getSigners())[0].address, "wrong sender");

  const saleProxy = new ethers.Contract(
    implementation,
    (await artifacts.readArtifact("Sale")).abi
  ) as Sale;

  const { sender: senderProxy, config } = (await getEventArgs(
    saleFactory.deployTransaction,
    "Construct",
    saleProxy
  )) as ConstructEvent["args"];

  assert(senderProxy === saleFactory.address, "wrong proxy sender");
  assert(
    config.redeemableERC20Factory === redeemableERC20Factory.address,
    "wrong redeemableERC20Factory in SaleConstructorConfig"
  );

  const interpreter = await rainterpreterDeploy();
  const expressionDeployer = await rainterpreterExpressionDeployerDeploy(
    interpreter
  );

  return {
    redeemableERC20Factory,
    readWriteTier,
    saleConstructorConfig,
    saleFactory,
    saleProxy,
    interpreter,
    expressionDeployer,
  };
};
