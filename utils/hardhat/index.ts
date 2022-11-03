import { Wallet } from "ethers";
import { hexlify, randomBytes } from "ethers/lib/utils";
import { ethers } from "hardhat";

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
 * Forces hardhat network to time warp forward for the given duration of time
 * @param duration - time to elapse in seconds
 */
export const timewarp = async (duration: number): Promise<void> => {
  await ethers.provider.send("evm_increaseTime", [duration]);
  await ethers.provider.send("evm_mine", []);
};

/**
 * Retrieve current block number from hardhat network.
 * @returns Current block number, according to hardhat network (i.e. `block.number`)
 */
export const getBlockNumber = async (): Promise<number> => {
  return await ethers.provider.getBlockNumber();
};

/**
 * Retrieve current timestamp from hardhat network.
 * @returns Current block timestamp, according to hardhat network (i.e. `block.timestamp`)
 */
export const getBlockTimestamp = async (): Promise<number> => {
  const blockNum = await ethers.provider.getBlockNumber();
  const block = await ethers.provider.getBlock(blockNum);
  return block.timestamp;
};

/**
 * Generate random wallet
 * @returns {Wallet} - a new instance of Wallet generated using a random privateKey
 */
export const generateRandomWallet = (): Wallet => {
  const privateKey = hexlify(randomBytes(32)).toString();
  return new ethers.Wallet(privateKey);
};
