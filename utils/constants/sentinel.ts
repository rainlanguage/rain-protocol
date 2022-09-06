import { ethers } from "ethers";
import { keccak256 } from "ethers/lib/utils";

export const SENTINEL_HIGH_BITS =
  "0xF000000000000000000000000000000000000000000000000000000000000000";

export const RAIN_FLOW_SENTINEL = ethers.BigNumber.from(
  keccak256([...Buffer.from("RAIN_FLOW_SENTINEL")])
).or(SENTINEL_HIGH_BITS);
