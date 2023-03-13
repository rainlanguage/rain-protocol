export type AddressPrint = {
  [contractName: string]: string;
};

const Register: AddressPrint = {};

export function registerContract(name_: string, address_: string): void {
  Register[name_] = address_;
  printAddress(name_, address_);
}

export function printAddress(name_: string, address_: string) {
  console.log(`${name_} deployed at: ${address_}`);
}

export function printAllAddresses() {
  console.table(Register);
}
