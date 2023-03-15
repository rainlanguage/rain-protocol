export type AddressPrint = {
  [contractName: string]: string;
};

export type VerificationData = {
  [contractName: string]: {
    /**
     * The address where the contract was deployed to.
     */
    contractaddress: string;
    /**
     * The qualified name of the contract. NOT THE SAME THAN CONTRACT NAME.
     */
    contractname: string;
    /**
     * The compiler version that the contract was compiled.
     */
    compilerversion: string;
    /**
     * The solt file. It's a JSON description input.
     * See: https://docs.soliditylang.org/en/latest/using-the-compiler.html#input-description
     */
    sourceCode: any;
  };
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
