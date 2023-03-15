import { artifacts } from "hardhat";
import type { BuildInfo } from "hardhat/types";

/**
 * Generate a valid JSON Input Description for a compiler using the Hardhat outputs
 */
export async function getInputSolt(contractName_: string) {
  const sources: any = {};

  const { qualifiedName, buildInfo } = await getBuildInfoFromName(
    contractName_
  );

  resolveSource(buildInfo, qualifiedName, sources);

  const input = {
    language: "Solidity",
    sources,
    settings: {
      metadata: buildInfo.input.settings.metadata,
      optimizer: buildInfo.input.settings.optimizer,
      evmVersion: buildInfo.input.settings.evmVersion,
      outputSelection: {
        "*": {
          "*": [
            "abi",
            "evm.bytecode",
            "evm.deployedBytecode",
            "evm.methodIdentifiers",
          ],
          "": ["id", "ast"],
        },
      },
    },
  };

  return input;
}

/**
 * Obtain the compilation build information of Hardhat for a given contract using
 * a `contractName`.
 *
 * Using the `contractName` also will allow to obtain the qualified name of the
 * contract.
 *
 * @param contractName_ The contract name
 * @returns The build information and the qualified name of the contract.
 */
const getBuildInfoFromName = async (
  contractName_: string
): Promise<{ buildInfo: BuildInfo; qualifiedName: string }> => {
  const _artifact = await artifacts.readArtifact(contractName_);
  const _QName = `${_artifact.sourceName}:${_artifact.contractName}`;

  return {
    buildInfo: (await artifacts.getBuildInfo(_QName)) as BuildInfo,
    qualifiedName: _QName,
  };
};

/**
 * Using a given `qualifiedNameOrPath` (contract qualified name or contract path)
 * try to resolve all the sources for that contract using a given `buildInfo`.
 *
 * This function works recursively to found every import required for the contract
 * using the build information created when Hardhat compile the contract.
 *
 * @param buildInfo_ The build information from Hardhat.
 * @param qualifiedNameOrPath_ The qualified name or path of the contract to resolve
 * the sources.
 * @param sources_ The object instance that hold all the sources resolved for the
 * contract.
 */
const resolveSource = (
  buildInfo_: BuildInfo,
  qualifiedNameOrPath_: string,
  sources_: any
) => {
  // It will need the path, but could be obtained from the qualified name. For
  // that reason make senses to support both. Eg:
  // <ContractPath>:<ContractName> -> <ContractPath>
  let path = qualifiedNameOrPath_;
  if (path.includes(":")) {
    [path] = qualifiedNameOrPath_.split(":");
  }

  // If the source instance object does not have the current path, then
  // add it.
  if (!sources_[path]) {
    sources_[path] = {
      content: buildInfo_.input.sources[path].content.toString(),
    };
  }

  // The build information from hardhat have all the sources for the contract,
  // but also have all the outputs and their own information like the 'ast'.
  // Using the ast and his node when can iterate on each contract and check
  // for their own imports. The nodes could be different types, but the contract
  // imports are 'ImportDirective', so only save those.
  buildInfo_.output.sources[path].ast.nodes.forEach((item) => {
    // Check if the node type is a contract import.
    if (item.nodeType == "ImportDirective") {
      // Check if this contract import with the `absolutePath` is already added.
      // Just skip if already added.
      if (!sources_[item.absolutePath]) {
        // For some reason, it should be assigned this way. If not the verifaction
        // process in the block explorer throw an error.
        sources_[item.absolutePath] = {
          content:
            buildInfo_.input.sources[item.absolutePath].content.toString(),
        };

        // Using recursivity to check if the current absolutePath have contract
        // imports and add his import to required sources.
        resolveSource(buildInfo_, item.absolutePath, sources_);
      }
    }
  });
};
