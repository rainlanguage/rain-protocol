import { Contract, ContractTransaction } from "ethers";
import { Result } from "ethers/lib/utils";

/**
 *
 * @param tx - transaction where event occurs
 * @param eventName - name of event
 * @param contract - contract object holding the address, filters, interface
 * @param contractAddressOverride - (optional) override the contract address which emits this event
 * @returns Array of events with their arguments, which can each be deconstructed by array index or by object key
 */
export const getEvents = async (
  tx: ContractTransaction,
  eventName: string,
  contract: Contract,
  contractAddressOverride: string = null
): Promise<Result[]> => {
  const address = contractAddressOverride
    ? contractAddressOverride
    : contract.address;

  const eventObjs = (await tx.wait()).events.filter(
    (x) =>
      x.topics[0] == contract.filters[eventName]().topics[0] &&
      x.address == address
  );

  if (!eventObjs.length) {
    throw new Error(`Could not find event ${eventName} at address ${address}`);
  }

  return eventObjs.map((eventObj) =>
    contract.interface.decodeEventLog(eventName, eventObj.data)
  );
};

/**
 *
 * @param tx - transaction where event occurs
 * @param eventName - name of event
 * @param contract - contract object holding the address, filters, interface
 * @param contractAddressOverride - (optional) override the contract address which emits this event
 * @returns Event arguments of first matching event, can be deconstructed by array index or by object key
 */
export const getEventArgs = async (
  tx: ContractTransaction,
  eventName: string,
  contract: Contract,
  contractAddressOverride: string = null
): Promise<Result> => {
  return (await getEvents(tx, eventName, contract, contractAddressOverride))[0];
};
