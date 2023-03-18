import { Interface } from "ethers/lib/utils";
import hre, { artifacts } from "hardhat";
import axios from "axios";
import { getInputSolt } from "../solc-inputs";
import { delay, updateIsVerified } from "../utils";

type VerifyBody = {
  apikey: string;
  module: "contract";
  action: "verifysourcecode";
  sourceCode: string;
  contractaddress: string;
  codeformat: "solidity-standard-json-input";
  contractname: string;
  compilerversion: string;
  constructorArguements?: string;
};

export async function verifyContract(
  contractName_: string,
  address_: string,
  args_: any = null
) {
  // Skiping hardhat network since it's localhost
  if (hre.network.name !== "hardhat") {
    const { apiUrl, apiKey } = hre.config.verificationApi[hre.network.name];

    // Checking if contract is already verified
    const verified = await isVerified(apiKey, address_);

    if (verified) {
      updateIsVerified(contractName_, true);
      return;
    }

    const body = await buildBody(contractName_, address_, args_, apiKey);
    await sendVerification(apiUrl, apiKey, body);
  }
}

async function isVerified(apiKey_: string, address_: string): Promise<boolean> {
  const url = `https://api-testnet.polygonscan.com/api?module=contract&action=getsourcecode&address=${address_}&apikey=${apiKey_}`;
  const resp = await axios.get(url);

  // If SourceCode is empty, contract not verified
  return resp.data.result[0].SourceCode !== "";
}

async function sendVerification(url: string, apiKey: string, body: VerifyBody) {
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  const resp = await axios.post(url, body, { headers });

  let message = "";

  if (resp.data.status == 1) {
    // The verification was sent
    const bodyCheck = {
      apikey: apiKey,
      guid: resp.data.result,
      module: "contract",
      action: "checkverifystatus",
    };

    let isVerified = false;
    let i = 0;

    // Now wait a few secs (max 20) to ask if the contract is verified
    // It's possible that verification take to much and fail (for many reasons).
    // WARNING: Be careful and take attention to the messages.
    while (!isVerified && i < 4) {
      await delay(5000);
      const respCheck = await axios.get(url, {
        data: bodyCheck,
        headers: headers,
      });

      message = `contract address "${body.contractaddress}": ${respCheck.data.result}`;

      if (respCheck.data.status == 1) {
        // The contract is verified
        isVerified = true;
        const [, name] = body.contractname.split(":");
        updateIsVerified(name, true);
      }

      i++;
    }
  } else {
    // An error happened when the verification was sent
    message = `"${body.contractaddress}": ${resp.data.result}`;
  }

  console.log(`${body.contractname} - ${message}`);
  console.log("-----------");
}

async function buildBody(
  contractName_: string,
  address_: string,
  args_: any,
  apiKey_: string
): Promise<VerifyBody> {
  const contractInfo = await getContractInfo(contractName_);

  const body: any = {
    apikey: apiKey_,
    module: "contract",
    action: "verifysourcecode",
    sourceCode: JSON.stringify(contractInfo.soltFile),
    contractaddress: address_,
    codeformat: "solidity-standard-json-input",
    contractname: contractInfo.qualifiedName,
    compilerversion: contractInfo.compilerVersion,
  };

  if (args_) {
    // Generating the iface to get the encoded arguments
    const abi = artifacts.readArtifactSync(contractName_).abi;
    const iface = new Interface(abi);

    // Removing the 0x before assign it
    body.constructorArguements = iface.encodeDeploy([args_]).substring(2);
  }

  return body;
}

async function getContractInfo(contractName_: string) {
  // Get the generated Input JSON
  const soltFile = await getInputSolt(contractName_);

  // Obtain the qualifiedName to be founded on the SoltFile
  const allNames = await artifacts.getAllFullyQualifiedNames();
  const qualifiedName = allNames.find((e) => {
    return e.substring(e.indexOf(":") + 1) === contractName_;
  });

  // Get the solidity compiler versio
  const buildInfo = await artifacts.getBuildInfo(qualifiedName);
  const compilerVersion = `v${buildInfo.solcLongVersion}`;

  return {
    soltFile,
    qualifiedName,
    compilerVersion,
  };
}
