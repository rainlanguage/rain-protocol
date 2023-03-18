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

  // Follow the same format than `solt` for an Input JSON Description and using
  // the HardhatConfig.
  // See more: https://docs.soliditylang.org/en/v0.8.17/using-the-compiler.html#input-description
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
 * @dev The difference between an `importPath` and `absolutePath` is where that
 * path is being used. The `importPath` is the path that is inside Solidity,
 * basically is where the resolution com from and could be a relative import.
 * The `absolutePath` is the resolution solved, where really is the contract code.
 *
 * @param buildInfo_ The build information from Hardhat.
 * @param qualifiedNameOrPath_ The qualified name or path of the contract to resolve
 * the sources.
 * @param sources_ The object instance that hold all the sources resolved for the
 * contract.
 * @param filePath_ It is the file path inside the Solidity code
 */
const resolveSource = (
  buildInfo_: BuildInfo,
  qualifiedNameOrPath_: string,
  sources_: any,
  filePath_?: string
) => {
  // It will need the path, but could be obtained from the qualified name. For
  // that reason make senses to support both. Eg:
  // <ContractPath>:<ContractName> -> <ContractPath>
  let importPath = qualifiedNameOrPath_;
  let absolutePath = qualifiedNameOrPath_;
  if (importPath.includes(":")) {
    [importPath] = qualifiedNameOrPath_.split(":");
    [absolutePath] = qualifiedNameOrPath_.split(":");
  }

  if (
    filePath_ &&
    !filePath_.startsWith("../") &&
    !filePath_.startsWith("./")
  ) {
    importPath = filePath_;
  }

  if (!sources_[importPath]) {
    // If the source instance object does not have the current path, then
    // add it.
    sources_[importPath] = {
      content: buildInfo_.input.sources[absolutePath].content.toString(),
    };
  }

  // The build information from hardhat have all the sources for the contract,
  // but also have all the outputs and their own information like the 'ast'.
  // Using the ast and his node when can iterate on each contract and check
  // for their own imports. The nodes could be different types, but the contract
  // imports are 'ImportDirective', so only save those.
  buildInfo_.output.sources[absolutePath].ast.nodes.forEach((item) => {
    // Check if the node type is a contract import.
    if (item.nodeType == "ImportDirective") {
      // Check if this contract import with the `absolutePath` is already added.
      // Just skip if already added.

      const importPath =
        item.file.startsWith("../") || item.file.startsWith("./")
          ? item.absolutePath
          : item.file;

      if (!sources_[importPath]) {
        // For some reason, it should be assigned this way. If not the verifaction
        // process in the block explorer throw an error.
        sources_[importPath] = {
          content:
            buildInfo_.input.sources[item.absolutePath].content.toString(),
        };

        // Using recursivity to check if the current absolutePath have contract
        // imports and add his import to required sources.
        resolveSource(buildInfo_, item.absolutePath, sources_, importPath);
      }
    }
  });
};
