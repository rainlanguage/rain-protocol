import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { strict as assert } from "assert";
import { artifacts, ethers } from "hardhat";
import type { CloneFactory, CombineTier } from "../../../../typechain";
import { DeployerDiscoverableMetaV1ConstructionConfigStruct } from "../../../../typechain/contracts/factory/CloneFactory";

import { EvaluableConfigStruct } from "../../../../typechain/contracts/lobby/Lobby";
import { CombineTierConfigStruct } from "../../../../typechain/contracts/tier/CombineTier";
import { zeroAddress } from "../../../constants";
import { getEventArgs } from "../../../events";
import { getRainMetaDocumentFromContract } from "../../../meta";
import { getTouchDeployer } from "../../interpreter/shared/rainterpreterExpressionDeployer/deploy";

export const combineTierImplementation = async (): Promise<CombineTier> => {
  const combineTierFactory = await ethers.getContractFactory("CombineTier");
  const touchDeployer = await getTouchDeployer();
  const config_: DeployerDiscoverableMetaV1ConstructionConfigStruct = {
    meta: getRainMetaDocumentFromContract("combinetier"),
    deployer: touchDeployer.address,
  };

  const combineTier = (await combineTierFactory.deploy(config_)) as CombineTier;
  await combineTier.deployed();

  assert(
    !(combineTier.address === zeroAddress),
    "implementation combineTier zero address"
  );

  return combineTier;
};

export const combineTierCloneDeploy = async (
  deployer: SignerWithAddress,
  cloneFactory: CloneFactory,
  implementation: CombineTier,
  combinedTiersLength: number,
  initialConfig: EvaluableConfigStruct
): Promise<CombineTier> => {
  const combineTierConfig: CombineTierConfigStruct = {
    combinedTiersLength: combinedTiersLength,
    evaluableConfig: initialConfig,
  };

  const encodedConfig = ethers.utils.defaultAbiCoder.encode(
    [
      "tuple(uint256 combinedTiersLength ,tuple(address deployer,bytes[] sources,uint256[] constants) evaluableConfig)",
    ],
    [combineTierConfig]
  );

  const combineTierCloneTx = await cloneFactory.clone(
    implementation.address,
    encodedConfig
  );

  const combineTier = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(combineTierCloneTx, "NewClone", cloneFactory)).clone
      ),
      20
    ),
    (await artifacts.readArtifact("CombineTier")).abi,
    deployer
  ) as CombineTier;

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  combineTier.deployTransaction = combineTierCloneTx;

  await combineTier.deployed();

  return combineTier;
};
