import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { BigNumberish, BytesLike } from "ethers";
import { artifacts, ethers } from "hardhat";
import type { AutoApprove, CloneFactory } from "../../../../../typechain";
import { PromiseOrValue } from "../../../../../typechain/common";
import { NewCloneEvent } from "../../../../../typechain/contracts/factory/CloneFactory";
import { InterpreterCallerV1ConstructionConfigStruct } from "../../../../../typechain/contracts/flow/FlowCommon";
import { EvaluableConfigStruct } from "../../../../../typechain/contracts/verify/auto/AutoApprove";
import { ImplementationEvent as ImplementationEventAutoApproveFactory } from "../../../../../typechain/contracts/verify/auto/AutoApproveFactory";
import { zeroAddress } from "../../../../constants";
import { getEventArgs } from "../../../../events";
import { generateEvaluableConfig } from "../../../../interpreter";
import { getRainContractMetaBytes } from "../../../../meta";
import { getTouchDeployer } from "../../../interpreter/shared/rainterpreterExpressionDeployer/deploy";

export const autoApproveImplementation = async (): Promise<AutoApprove> => {
  const contractFactory = await ethers.getContractFactory("AutoApprove");

  const touchDeployer = await getTouchDeployer();
  const config_: InterpreterCallerV1ConstructionConfigStruct = {
    callerMeta: getRainContractMetaBytes("autoapprove"),
    deployer: touchDeployer.address,
  };

  const autoApproveImplementation = (await contractFactory.deploy(
    config_
  )) as AutoApprove;
  await autoApproveImplementation.deployed();

  assert(
    !(autoApproveImplementation.address === zeroAddress),
    "implementation autoApprove factory zero address"
  );

  return autoApproveImplementation;
};

export const autoApproveCloneDeploy = async (
  cloneFactory: CloneFactory,
  implementAutoApprove: AutoApprove,
  sources: PromiseOrValue<BytesLike>[],
  constants: PromiseOrValue<BigNumberish>[]
): Promise<AutoApprove> => {
  const evaluableConfig: EvaluableConfigStruct = await generateEvaluableConfig(
    sources,
    constants
  );

  const encodedConfig = ethers.utils.defaultAbiCoder.encode(
    [
      "tuple(address deployer,bytes[] sources,uint256[] constants) evaluableConfig",
    ],
    [evaluableConfig]
  );

  const autoApproveClone = await cloneFactory.clone(
    implementAutoApprove.address,
    encodedConfig
  );

  const cloneEvent = (await getEventArgs(
    autoApproveClone,
    "NewClone",
    cloneFactory
  )) as NewCloneEvent["args"];

  assert(
    !(cloneEvent.clone === zeroAddress),
    "Clone autoApprove factory zero address"
  );

  const autoApprove = (await ethers.getContractAt(
    "AutoApprove",
    cloneEvent.clone
  )) as AutoApprove;

  return autoApprove;
};

// export const autoApproveFactoryDeploy = async () => {
//   const factoryFactory = await ethers.getContractFactory("AutoApproveFactory");
//   const touchDeployer = await getTouchDeployer();
//   const config_: InterpreterCallerV1ConstructionConfigStruct = {
//     callerMeta: getRainContractMetaBytes("autoapprove"),
//     deployer: touchDeployer.address,
//   };
//   const autoApproveFactory = (await factoryFactory.deploy(
//     config_
//   )) as AutoApproveFactory;
//   await autoApproveFactory.deployed();

//   const { implementation } = (await getEventArgs(
//     autoApproveFactory.deployTransaction,
//     "Implementation",
//     autoApproveFactory
//   )) as ImplementationEventAutoApproveFactory["args"];
//   assert(
//     !(implementation === zeroAddress),
//     "implementation autoApprove factory zero address"
//   );

//   return autoApproveFactory;
// };

// export const autoApproveDeploy = async (
//   deployer: SignerWithAddress,
//   autoApproveFactory: AutoApproveFactory,
//   sources: PromiseOrValue<BytesLike>[],
//   constants: PromiseOrValue<BigNumberish>[]
// ) => {
//   const { implementation } = (await getEventArgs(
//     autoApproveFactory.deployTransaction,
//     "Implementation",
//     autoApproveFactory
//   )) as ImplementationEventAutoApproveFactory["args"];
//   assert(
//     !(implementation === zeroAddress),
//     "implementation autoApprove factory zero address"
//   );

//   const evaluableConfig: EvaluableConfigStruct = await generateEvaluableConfig(
//     sources,
//     constants
//   );

//   const tx = await autoApproveFactory
//     .connect(deployer)
//     .createChildTyped(evaluableConfig);
//   const autoApprove = new ethers.Contract(
//     ethers.utils.hexZeroPad(
//       ethers.utils.hexStripZeros(
//         (await getEventArgs(tx, "NewChild", autoApproveFactory)).child
//       ),
//       20
//     ),
//     (await artifacts.readArtifact("AutoApprove")).abi,
//     deployer
//   ) as AutoApprove;
//   await autoApprove.deployed();

//   // eslint-disable-next-line @typescript-eslint/ban-ts-comment
//   // @ts-ignore
//   autoApprove.deployTransaction = tx;

//   return autoApprove;
// };
