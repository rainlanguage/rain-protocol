export type AddressPrint = {
  [contractName: string]: string;
};

const Register: AddressPrint = {};

export function registerContract(name_: string, address_: string): void {
  Register[name_] = address_;
}

export function printAddresses() {
  console.table(Register);
}
