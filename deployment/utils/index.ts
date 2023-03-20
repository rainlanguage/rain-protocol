import { artifacts } from "hardhat";
import { arrayify } from "rainlang";
import { deflateJson } from "../../utils";
import { cborEncode, MAGIC_NUMBERS } from "../../utils/meta/cbor";
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
    contractArguments: any | null;
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
    contractArguments: args_,
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
    const _contractRegistered = Contracts[Keys[i]];
    const { contractAddress, contractArguments } = _contractRegistered;

    await verifyContract(_name, contractAddress, contractArguments);
  }

  // Print all the results
  printAllAddresses();
}

export const delay = (ms: number): unknown =>
  new Promise((res) => setTimeout(res, ms));

export const getCloneFactoryMeta = (): string => {
  const metaDocumentHex =
    "0x" + MAGIC_NUMBERS.RAIN_META_DOCUMENT.toString(16).toLowerCase();

  // Get ABI clone abi and deflate it
  const cloneAbi = deflateJson(artifacts.readArtifactSync("CloneFactory").abi);
  const abiJson = arrayify(cloneAbi).buffer;

  const abiEncoded = cborEncode(
    abiJson,
    MAGIC_NUMBERS.SOLIDITY_ABIV2,
    "application/json",
    {
      contentEncoding: "deflate",
    }
  );

  const meta = metaDocumentHex + abiEncoded;

  return meta;
};
