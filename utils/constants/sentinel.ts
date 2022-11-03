import { ethers } from "ethers";
import { keccak256 } from "ethers/lib/utils";

export const SENTINEL_HIGH_BITS =
  "0xF000000000000000000000000000000000000000000000000000000000000000";

export const RAIN_FLOW_SENTINEL = ethers.BigNumber.from(
  keccak256([...Buffer.from("RAIN_FLOW_SENTINEL")])
).or(SENTINEL_HIGH_BITS);

export const RAIN_FLOW_ERC20_SENTINEL = ethers.BigNumber.from(
  keccak256([...Buffer.from("RAIN_FLOW_ERC20_SENTINEL")])
).or(SENTINEL_HIGH_BITS);

export const RAIN_FLOW_ERC721_SENTINEL = ethers.BigNumber.from(
  keccak256([...Buffer.from("RAIN_FLOW_ERC721_SENTINEL")])
).or(SENTINEL_HIGH_BITS);

export const RAIN_FLOW_ERC1155_SENTINEL = ethers.BigNumber.from(
  keccak256([...Buffer.from("RAIN_FLOW_ERC1155_SENTINEL")])
).or(SENTINEL_HIGH_BITS);
