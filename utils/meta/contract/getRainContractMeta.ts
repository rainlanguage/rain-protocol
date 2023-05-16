import Flow from "../../../contracts/flow/basic/Flow.meta.json";
import FlowERC20 from "../../../contracts/flow/erc20/FlowERC20.meta.json";
import FlowERC721 from "../../../contracts/flow/erc721/FlowERC721.meta.json";
import FlowERC1155 from "../../../contracts/flow/erc1155/FlowERC1155.meta.json";
import Lobby from "../../../contracts/lobby/Lobby.meta.json";
import Orderbook from "../../../contracts/orderbook/OrderBook.meta.json";
import Sale from "../../../contracts/sale/Sale.meta.json";
import Stake from "../../../contracts/stake/Stake.meta.json";
import CombineTier from "../../../contracts/tier/CombineTier.meta.json";
import AutoApprove from "../../../contracts/verify/auto/AutoApprove.meta.json";
import ContractMetaSchema from "../../../schema/meta/v0/contract.meta.schema.json";
import { deflateJson, metaFromBytes, validateMeta } from "../general";
import { artifacts } from "hardhat";
import { BytesLike } from "ethers/lib/utils";
import _ from "lodash";

import type { ContractMeta } from "../../types/contractMeta";

/**
 * @public
 * Get deplyable compressed bytes of a Rain contract meta
 *
 * @param contract - Name of a Rain contract, eg "sale", "flowErc20"
 * @returns Deployable bytes as hex string
 */
export const getRainContractMetaBytes = (contract: ContractMeta): string => {
  let meta;
  if (contract === "sale") meta = Sale;
  if (contract === "stake") meta = Stake;
  if (contract === "orderbook") meta = Orderbook;
  if (contract === "flow") meta = Flow;
  if (contract === "flow20") meta = FlowERC20;
  if (contract === "flow721") meta = FlowERC721;
  if (contract === "flow1155") meta = FlowERC1155;
  if (contract === "lobby") meta = Lobby;
  if (contract === "autoapprove") meta = AutoApprove;
  if (contract === "combinetier") meta = CombineTier;
  if (!validateMeta(meta, ContractMetaSchema))
    throw new Error("invalid contract meta");
  return deflateJson(meta);
};

/**
 * @public
 * Decompress and convert bytes to one of Rain's contract metas
 *
 * @param bytes - Bytes to decompress and convert back to json meta
 * @param path - Path to write the results to if having the output as a json file is desired, won't write to file if not provided.
 * @returns Rain contract Meta as object
 */
export const getRainContractMetaFromBytes = (
  bytes: BytesLike,
  path?: string
) => {
  return metaFromBytes(bytes, ContractMetaSchema, path);
};

export const validateContractMetaAgainstABI = (
  contractName_: ContractMeta
): boolean => {
  let meta, name;

  if (contractName_ === "sale") {
    (meta = Sale), (name = "Sale");
  }
  if (contractName_ === "stake") {
    (meta = Stake), (name = "Stake");
  }
  if (contractName_ === "orderbook") {
    (meta = Orderbook), (name = "OrderBook");
  }
  if (contractName_ === "flow") {
    (meta = Flow), (name = "Flow");
  }
  if (contractName_ === "flow20") {
    (meta = FlowERC20), (name = "FlowERC20");
  }
  if (contractName_ === "flow721") {
    (meta = FlowERC721), (name = "FlowERC721");
  }
  if (contractName_ === "flow1155") {
    (meta = FlowERC1155), (name = "FlowERC1155");
  }
  if (contractName_ === "lobby") {
    (meta = Lobby), (name = "Lobby");
  }
  if (contractName_ === "autoapprove") {
    (meta = AutoApprove), (name = "AutoApprove");
  }
  if (contractName_ === "combinetier") {
    (meta = CombineTier), (name = "CombineTier");
  }

  if (!validateMeta(meta, ContractMetaSchema))
    throw new Error("invalid contract meta");

  if (!name) throw new Error("Invalid contract name");

  const abiJSON = artifacts.readArtifactSync(name).abi;

  // Get methods from meta
  const methods = meta.methods;

  for (let i = 0; i < methods.length; i++) {
    // Eval consistenct for meta and abi
    const method = methods[i];

    if (method.inputs) {
      const inputs = method.inputs;
      // Check for inputs
      for (let j = 0; j < inputs.length; j++) {
        // Checks if a valid object is present at path
        if (_.has(abiJSON, inputs[j].path)) {
          // validates the abiName
          if (inputs[j].abiName != _.get(abiJSON, inputs[j].path).name) {
            throw new Error(
              `mismatch input name for method ${method.name},
              expected  ${_.get(abiJSON, inputs[j].path).name}
              got       ${inputs[j].abiName}
              at path ${inputs[j].path}`
            );
          }
        } else {
          throw new Error(
            `object not found at path for method ${method.name},
            current path  ${inputs[j].path}`
          );
        }
      }
    }

    if (method.expressions) {
      const expressions = method.expressions;
      //Check for expressions
      for (let k = 0; k < expressions.length; k++) {
        if (
          expressions[k].abiName != _.get(abiJSON, expressions[k].path).name
        ) {
          throw new Error(
            `mismatch expression name for method ${method.name},
                        expected  ${_.get(abiJSON, expressions[k].path).name}
                        got       ${expressions[k].abiName}`
          );
        }
      }
    }
  }

  return true;
};
