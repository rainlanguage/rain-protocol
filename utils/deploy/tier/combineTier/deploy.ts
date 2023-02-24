import { assert } from "chai";
import { ethers } from "hardhat";
import type { CloneFactory, CombineTier } from "../../../../typechain";
import { NewCloneEvent } from "../../../../typechain/contracts/factory/CloneFactory";
import { InterpreterCallerV1ConstructionConfigStruct } from "../../../../typechain/contracts/flow/FlowCommon";
import { EvaluableConfigStruct } from "../../../../typechain/contracts/lobby/Lobby";
import { CombineTierConfigStruct } from "../../../../typechain/contracts/tier/CombineTier";
import { zeroAddress } from "../../../constants";
import { getEventArgs } from "../../../events";
import { getRainContractMetaBytes } from "../../../meta";
import { getTouchDeployer } from "../../interpreter/shared/rainterpreterExpressionDeployer/deploy";

export const combineTierImplementation = async (): Promise<CombineTier> => {
  const combineTierFactory = await ethers.getContractFactory("CombineTier");
  const touchDeployer = await getTouchDeployer();
  const config_: InterpreterCallerV1ConstructionConfigStruct = {
    callerMeta: getRainContractMetaBytes("combinetier"),
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

  const combineTierClone = await cloneFactory.clone(
    implementation.address,
    encodedConfig
  );

  const cloneEvent = (await getEventArgs(
    combineTierClone,
    "NewClone",
    cloneFactory
  )) as NewCloneEvent["args"];

  assert(!(cloneEvent.clone === zeroAddress), "combineTier clone zero address");

  const combineTier = (await ethers.getContractAt(
    "Lobby",
    cloneEvent.clone
  )) as CombineTier;

  return combineTier;
};
