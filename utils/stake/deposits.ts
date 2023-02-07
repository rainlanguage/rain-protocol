import { BigNumber } from "ethers";
import { Stake } from "../../typechain";

interface Deposit {
  timestamp: number;
  amount: BigNumber;
}

/**
 * @public
 * Retrieves array of `Stake` deposit records for the given signer.
 *
 * @param stake `Stake` contract object
 * @param signerAddress address of signer to retrieve deposit records
 * @returns array of `Deposit` objects
 */
export const getDeposits = async (stake: Stake, signerAddress: string) => {
  const deposits: Deposit[] = [];
  let i = 0;
  let flag = true;

  while (flag) {
    try {
      const depositItem = await stake.depositRecords(signerAddress, i);
      deposits.push(depositItem);
      i++;
    } catch (e) {
      flag = false;
    }
  }

  return deposits;
};
