import { FlowTransferV1Struct } from "../../typechain/contracts/flow/basic/Flow";
import { FlowERC1155IOV1Struct } from "../../typechain/contracts/flow/erc1155/FlowERC1155";
import { FlowERC20IOV1Struct } from "../../typechain/contracts/flow/erc20/FlowERC20";
import { FlowERC721IOV1Struct } from "../../typechain/contracts/flow/erc721/FlowERC721";

/**
 * @public
 * Fills empty address fields within FlowTransferStruct with the given address
 *
 * @param flow FlowTransferStruct holding partially filled structs
 * @param address address to fill in FlowTransferStruct
 */
export const fillEmptyAddress = (
  flow: FlowTransferV1Struct,
  address: string
): FlowTransferV1Struct => {
  // erc20
  for (const erc20 of flow.erc20) {
    if (erc20.from == "") erc20.from = address;
    else if (erc20.to == "") erc20.to = address;
  }

  // erc721
  for (const erc721 of flow.erc721) {
    if (erc721.from == "") erc721.from = address;
    else if (erc721.to == "") erc721.to = address;
  }

  // erc1155
  for (const erc1155 of flow.erc1155) {
    if (erc1155.from == "") erc1155.from = address;
    else if (erc1155.to == "") erc1155.to = address;
  }

  return flow;
};

/**
 * @public
 * Fills empty address fields within FlowTransferStruct with the given address
 *
 * @param flow FlowTransferStruct holding partially filled structs
 * @param address address to fill in FlowTransferStruct
 */
export const fillEmptyAddressERC20 = (
  flow: FlowERC20IOV1Struct,
  address: string
): FlowERC20IOV1Struct => {
  // erc20
  for (const erc20 of flow.flow.erc20) {
    if (erc20.from == "") erc20.from = address;
    else if (erc20.to == "") erc20.to = address;
  }

  // erc721
  for (const erc721 of flow.flow.erc721) {
    if (erc721.from == "") erc721.from = address;
    else if (erc721.to == "") erc721.to = address;
  }

  // erc1155
  for (const erc1155 of flow.flow.erc1155) {
    if (erc1155.from == "") erc1155.from = address;
    else if (erc1155.to == "") erc1155.to = address;
  }

  // mints
  for (const mint of flow.mints) {
    if (mint.account == "") mint.account = address;
  }

  // burns
  for (const burn of flow.burns) {
    if (burn.account == "") burn.account = address;
  }

  return flow;
};

/**
 * @public
 * Fills empty address fields within FlowTransferStruct with the given address
 *
 * @param flow FlowTransferStruct holding partially filled structs
 * @param address address to fill in FlowTransferStruct
 */
export const fillEmptyAddressERC721 = (
  flow: FlowERC721IOV1Struct,
  address: string
): FlowERC721IOV1Struct => {
  // erc20
  for (const erc20 of flow.flow.erc20) {
    if (erc20.from == "") erc20.from = address;
    else if (erc20.to == "") erc20.to = address;
  }

  // erc721
  for (const erc721 of flow.flow.erc721) {
    if (erc721.from == "") erc721.from = address;
    else if (erc721.to == "") erc721.to = address;
  }

  // erc1155
  for (const erc1155 of flow.flow.erc1155) {
    if (erc1155.from == "") erc1155.from = address;
    else if (erc1155.to == "") erc1155.to = address;
  }

  // mints
  for (const mint of flow.mints) {
    if (mint.account == "") mint.account = address;
  }

  // burns
  for (const burn of flow.burns) {
    if (burn.account == "") burn.account = address;
  }

  return flow;
};

/**
 * @public
 * Fills empty address fields within FlowTransferStruct with the given address
 *
 * @param flow FlowTransferStruct holding partially filled structs
 * @param address address to fill in FlowTransferStruct
 */
export const fillEmptyAddressERC1155 = (
  flow: FlowERC1155IOV1Struct,
  address: string
): FlowERC1155IOV1Struct => {
  // erc20
  for (const erc20 of flow.flow.erc20) {
    if (erc20.from == "") erc20.from = address;
    else if (erc20.to == "") erc20.to = address;
  }

  // erc721
  for (const erc721 of flow.flow.erc721) {
    if (erc721.from == "") erc721.from = address;
    else if (erc721.to == "") erc721.to = address;
  }

  // erc1155
  for (const erc1155 of flow.flow.erc1155) {
    if (erc1155.from == "") erc1155.from = address;
    else if (erc1155.to == "") erc1155.to = address;
  }

  // mints
  for (const mint of flow.mints) {
    if (mint.account == "") mint.account = address;
  }

  // burns
  for (const burn of flow.burns) {
    if (burn.account == "") burn.account = address;
  }

  return flow;
};
