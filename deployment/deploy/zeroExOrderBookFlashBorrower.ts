import { ethers } from "hardhat";
import { registerContract } from "../utils";
import { getContractAddressesForChainOrThrow } from "@0x/contract-addresses";

import type { OrderBook } from "../../typechain";

/**
 * Use the tiny library with all the addresses for the `0x Protocol`.
 *
 * Basically use the chainId from the current provider so always can get the
 * correct address deploy at that chain.
 *
 * See all the addresses and chains supported on:
 * https://docs.0x.org/developer-resources/contract-addresses
 */
const getExchangeProxy = async () => {
  const { chainId } = await ethers.provider.getNetwork();

  // If it's Hardhat network, just use am arbitr
  if (chainId === 31337) {
    return "0xdef1c0ded9bec7f1a1670819833240f027b25eff";
  } else {
    const { exchangeProxy } = getContractAddressesForChainOrThrow(chainId);

    return exchangeProxy;
  }
};
