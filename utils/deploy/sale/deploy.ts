import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";

import { artifacts, ethers } from "hardhat";
import {
  CloneFactory,
  RainterpreterExpressionDeployer,
  RedeemableERC20,
  Sale,
} from "../../../typechain";
import { NewCloneEvent } from "../../../typechain/contracts/factory/CloneFactory";
import { InterpreterCallerV1ConstructionConfigStruct } from "../../../typechain/contracts/flow/FlowCommon";
import {
  InitializeEvent,
  SaleConfigStruct,
  SaleConstructorConfigStruct,
  SaleRedeemableERC20ConfigStruct,
} from "../../../typechain/contracts/sale/Sale";
import { zeroAddress } from "../../constants";
import { getEventArgs } from "../../events";
import { getRainContractMetaBytes } from "../../meta";

import { getTouchDeployer } from "../interpreter/shared/rainterpreterExpressionDeployer/deploy";
import { redeemableERC20DeployImplementation } from "../redeemableERC20/deploy";

export const saleImplementation = async (
  cloneFactory: CloneFactory
): Promise<Sale> => {
  const saleFactory = await ethers.getContractFactory("Sale", {});

  const touchDeployer: RainterpreterExpressionDeployer =
    await getTouchDeployer();
  const interpreterCallerConfig: InterpreterCallerV1ConstructionConfigStruct = {
    callerMeta: getRainContractMetaBytes("sale"),
    deployer: touchDeployer.address,
  };

  const redeemableERC20Implementation: RedeemableERC20 =
    await redeemableERC20DeployImplementation();
  const maximumSaleTimeout = 10000;

  const saleConstructorConfig: SaleConstructorConfigStruct = {
    maximumSaleTimeout: maximumSaleTimeout,
    cloneFactory: cloneFactory.address,
    redeemableERC20Implementation: redeemableERC20Implementation.address,
    interpreterCallerConfig: interpreterCallerConfig,
  };

  const sale = (await saleFactory.deploy(saleConstructorConfig)) as Sale;

  assert(!(sale.address === zeroAddress), "implementation sale zero address");

  return sale;
};

export const saleClone = async (
  signers: SignerWithAddress[],
  deployer: SignerWithAddress,
  cloneFactory: CloneFactory,
  implementation: Sale,
  saleConfig: SaleConfigStruct,
  saleRedeemableERC20Config: SaleRedeemableERC20ConfigStruct
): Promise<[Sale, RedeemableERC20]> => {
  const encodedConfig = ethers.utils.defaultAbiCoder.encode(
    [
      "tuple(address recipient, address reserve, uint256 saleTimeout, uint256 cooldownDuration, uint256 minimumRaise, uint256 dustSize, tuple(address deployer,bytes[] sources,uint256[] constants) evaluableConfig)",
      "tuple(tuple(string name, string symbol, address distributor, uint256 initialSupply) erc20Config, address tier, uint256 minimumTier, address distributionEndForwardingAddress )",
    ],
    [saleConfig, saleRedeemableERC20Config]
  );

  const saleClone = await cloneFactory.clone(
    implementation.address,
    encodedConfig
  );

  const sale = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(saleClone, "NewClone", cloneFactory)).clone
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
  sale.deployTransaction = saleClone;

  let token = new ethers.Contract(
    await sale.token(),
    (await artifacts.readArtifact("RedeemableERC20")).abi
  ) as RedeemableERC20;

  token = token.connect(signers[0]); // need to do this for some reason

  return [sale, token];
};

// export const saleDeploy = async (
//   signers: SignerWithAddress[],
//   deployer: SignerWithAddress,
//   saleFactory: SaleFactory,
//   config: SaleConfigStruct,
//   saleRedeemableERC20Config: SaleRedeemableERC20ConfigStruct,
//   ...args: Overrides[]
// ): Promise<[Sale, RedeemableERC20]> => {
//   const txDeploy = await saleFactory.createChildTyped(
//     config,
//     saleRedeemableERC20Config,
//     ...args
//   );

//   const sale = new ethers.Contract(
//     ethers.utils.hexZeroPad(
//       ethers.utils.hexStripZeros(
//         (await getEventArgs(txDeploy, "NewChild", saleFactory)).child
//       ),
//       20 // address bytes length
//     ),
//     (await artifacts.readArtifact("Sale")).abi,
//     deployer
//   ) as Sale;

//   if (!ethers.utils.isAddress(sale.address)) {
//     throw new Error(
//       `invalid sale address: ${sale.address} (${sale.address.length} chars)`
//     );
//   }

//   await sale.deployed();

//   // eslint-disable-next-line @typescript-eslint/ban-ts-comment
//   // @ts-ignore
//   sale.deployTransaction = txDeploy;

//   let token = new ethers.Contract(
//     await sale.token(),
//     (await artifacts.readArtifact("RedeemableERC20")).abi
//   ) as RedeemableERC20;

//   token = token.connect(signers[0]); // need to do this for some reason

//   return [sale, token];
// };

// export const saleDependenciesDeploy = async () => {
//   const redeemableERC20Factory = await redeemableERC20FactoryDeploy();
//   const readWriteTier = await readWriteTierDeploy();
//   const touchDeployer = await getTouchDeployer();
//   const config_: InterpreterCallerV1ConstructionConfigStruct = {
//     callerMeta: getRainContractMetaBytes("sale"),
//     deployer: touchDeployer.address,
//   };

//   const saleConstructorConfig: SaleConstructorConfigStruct = {
//     maximumSaleTimeout: 10000,
//     redeemableERC20Factory: redeemableERC20Factory.address,
//     interpreterCallerConfig: config_,
//   };

//   const saleFactory = await saleFactoryDeploy(saleConstructorConfig);

//   const { implementation, sender } = await getEventArgs(
//     saleFactory.deployTransaction,
//     "Implementation",
//     saleFactory
//   );

//   assert(sender === (await ethers.getSigners())[0].address, "wrong sender");

//   const saleProxy = new ethers.Contract(
//     implementation,
//     (await artifacts.readArtifact("Sale")).abi
//   ) as Sale;

//   const { sender: senderProxy, config } = (await getEventArgs(
//     saleFactory.deployTransaction,
//     "Construct",
//     saleProxy
//   )) as ConstructEvent["args"];

//   assert(senderProxy === saleFactory.address, "wrong proxy sender");
//   assert(
//     config.redeemableERC20Factory === redeemableERC20Factory.address,
//     "wrong redeemableERC20Factory in SaleConstructorConfig"
//   );

//   return {
//     redeemableERC20Factory,
//     readWriteTier,
//     saleConstructorConfig,
//     saleFactory,
//     saleProxy,
//   };
// };
