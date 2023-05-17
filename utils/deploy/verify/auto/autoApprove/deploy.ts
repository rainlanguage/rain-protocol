import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { strict as assert } from "assert";
import { BigNumberish, BytesLike } from "ethers";
import { artifacts, ethers } from "hardhat";
import type { AutoApprove, CloneFactory } from "../../../../../typechain";
import { PromiseOrValue } from "../../../../../typechain/common";
import { DeployerDiscoverableMetaV1ConstructionConfigStruct } from "../../../../../typechain/contracts/factory/CloneFactory";

import {
  AutoApproveConfigStruct,
  EvaluableConfigStruct,
} from "../../../../../typechain/contracts/verify/auto/AutoApprove";

import { zeroAddress } from "../../../../constants";
import { getEventArgs } from "../../../../events";
import { generateEvaluableConfig } from "../../../../interpreter";
import { getRainMetaDocumentFromContract } from "../../../../meta";
import { getTouchDeployer } from "../../../interpreter/shared/rainterpreterExpressionDeployer/deploy";

export const autoApproveImplementation = async (): Promise<AutoApprove> => {
  const contractFactory = await ethers.getContractFactory("AutoApprove");

  const touchDeployer = await getTouchDeployer();
  const config_: DeployerDiscoverableMetaV1ConstructionConfigStruct = {
    meta: getRainMetaDocumentFromContract("autoapprove"),
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
  deployer: SignerWithAddress,
  cloneFactory: CloneFactory,
  implementAutoApprove: AutoApprove,
  owner: SignerWithAddress,
  sources: PromiseOrValue<BytesLike>[],
  constants: PromiseOrValue<BigNumberish>[]
): Promise<AutoApprove> => {
  const evaluableConfig: EvaluableConfigStruct = await generateEvaluableConfig(
    sources,
    constants
  );

  const initalConfig: AutoApproveConfigStruct = {
    owner: owner.address,
    evaluableConfig: evaluableConfig,
  };

  const encodedConfig = ethers.utils.defaultAbiCoder.encode(
    [
      "tuple(address owner, tuple(address deployer,bytes[] sources,uint256[] constants) evaluableConfig)",
    ],
    [initalConfig]
  );

  const autoApproveCloneTx = await cloneFactory.clone(
    implementAutoApprove.address,
    encodedConfig
  );

  const autoApprove = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(autoApproveCloneTx, "NewClone", cloneFactory)).clone
      ),
      20
    ),
    (await artifacts.readArtifact("AutoApprove")).abi,
    deployer
  ) as AutoApprove;
  await autoApprove.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  autoApprove.deployTransaction = autoApproveCloneTx;

  return autoApprove;
};
