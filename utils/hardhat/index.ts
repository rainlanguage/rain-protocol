import { Wallet } from "ethers";
import { hexlify, randomBytes } from "ethers/lib/utils";
import { ethers } from "hardhat";

/**
 * @public
 * Creates empty blocks on the blockchain
 *
 * @param count number of blocks to create
 */
export const createEmptyBlock = async (count?: number): Promise<void> => {
  const signers = await ethers.getSigners();
  const tx = { to: signers[1].address };
  if (count > 0) {
    for (let i = 0; i < count; i++) {
      await signers[0].sendTransaction(tx);
    }
  } else {
    await signers[0].sendTransaction(tx);
  }
};

/**
 * @public
 * Forces hardhat network to advance time for the given duration
 *
 * @param duration - time to elapse in seconds
 */
export const timewarp = async (duration: number): Promise<void> => {
  await ethers.provider.send("evm_increaseTime", [duration]);
  await ethers.provider.send("evm_mine", []);
};

/**
 * @public
 * Retrieve current block number from hardhat network.
 *
 * @returns Current block number, according to hardhat network (i.e. `block.number`)
 */
export const getBlockNumber = async (): Promise<number> => {
  return await ethers.provider.getBlockNumber();
};

/**
 * @public
 * Retrieve current timestamp from hardhat network.
 *
 * @returns Current block timestamp, according to hardhat network (i.e. `block.timestamp`)
 */
export const getBlockTimestamp = async (): Promise<number> => {
  const blockNum = await ethers.provider.getBlockNumber();
  const block = await ethers.provider.getBlock(blockNum);
  return block.timestamp;
};

/**
 * @public
 * Generate wallet with random key
 *
 * @returns {Wallet} - a new Wallet instance generated using a random privateKey
 */
export const generateRandomWallet = (): Wallet => {
  const privateKey = hexlify(randomBytes(32)).toString();
  return new ethers.Wallet(privateKey);
};
