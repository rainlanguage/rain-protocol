import { ethers } from "hardhat";
import { Signer, utils } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

export const keylessDeploy = async (
  contractName: string,
  signer: Signer | SignerWithAddress,
  args: any = []
) => {
  args = Array.isArray(args) ? args : [args];

  const provider = signer.provider;

  if (!provider || !provider._isProvider) throw new Error("Not provider");

  const factory = await ethers.getContractFactory(contractName);

  const txReq = factory.getDeployTransaction(...args);

  const gasLimit = await provider.estimateGas(txReq);

  const tx = {
    nonce: 0,
    gasPrice: "0x09184e72a000",
    gasLimit: gasLimit,
    value: "0x00",
    data: factory.bytecode,
    type: 0,
  };

  const signature = {
    r: "0x1231231231231231231231231231231231231231231231231231231231231231",
    s: "0x1231231231231231231231231231231231231231231231231231231231231231",
    v: 27,
  };

  const rawTx = utils.serializeTransaction(tx, signature);
  const parsedTx = utils.parseTransaction(rawTx);
  const deployerAddress = parsedTx.from;

  // Deterministically calculated contract address
  const contractAddress = ethers.utils.getContractAddress({
    from: deployerAddress,
    nonce: 0,
  });

  // If the contract is deployed to this address, return the instance direclty
  const code = await provider.getCode(contractAddress);
  if (code != "0x") return factory.attach(contractAddress);

  // Send funds to the address
  await signer.sendTransaction({
    to: deployerAddress,
    // Send GasLimit * GasPrice of the tx
    value: ethers.BigNumber.from(tx.gasLimit).mul(tx.gasPrice),
  });

  const txResp = await provider.sendTransaction(rawTx);
  const txReceipt = await txResp.wait();

  return factory.attach(txReceipt.contractAddress);
};
