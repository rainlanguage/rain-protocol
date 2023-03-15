import { verifyContract } from "../verify";

export type ContractData = {
  [contractName: string]: {
    /**
     * The address where the contract was deployed to.
     */
    contractAddress: string;
    /**
     * Flag if this contract was verified to the block explorer
     */
    isVerified: boolean;
    /**
     * The argument used to deploy (if needed)
     */
    arguments?: string;
  };
};

const Contracts: ContractData = {};

export function registerContract(
  name_: string,
  address_: string,
  args_: any = null
): void {
  Contracts[name_] = {
    contractAddress: address_,
    isVerified: false,
    arguments: args_,
  };
}

export function updateIsVerified(name_: string, status_: boolean) {
  if (Contracts[name_]) {
    Contracts[name_].isVerified = status_;
  }
}

function printAllAddresses() {
  console.table(Contracts, ["contractAddress", "isVerified"]);
}

export async function verifyAll() {
  const Keys = Object.keys(Contracts);
  for (let i = 0; i < Keys.length; i++) {
    const _name = Keys[i];
    const _contract = Contracts[Keys[i]];
    await verifyContract(_name, _contract.contractAddress);
  }

  // Print all the results
  printAllAddresses();
}
