import { ethers, network } from "hardhat";
import { rainterpreterDeploy } from "../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployerDeploy } from "../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import {
  arrayify,
  getAddress,
  hashMessage,
  hexlify,
  keccak256,
  recoverAddress,
  recoverPublicKey,
  serializeTransaction,
} from "ethers/lib/utils";
import {
  execSync,
  type ExecSyncOptionsWithStringEncoding,
} from "child_process";

import type { NoticeBoard, Rainterpreter } from "../typechain";
import { constants } from "buffer";

type DataNotice = {
  repo: string;
  commit: string | Buffer;
  network: string;
  contracts: Array<{
    name: string;
    address: string;
    bytecodeHash: string;
  }>;
};

/**
 * Execute Child Processes
 * @param cmd Command to execute
 * @returns The command ran it
 */
const exec = (
  cmd: string,
  options: ExecSyncOptionsWithStringEncoding = { encoding: "ascii" }
): string | Buffer => {
  try {
    return execSync(cmd, options);
  } catch (e) {
    throw new Error(`Failed to run command \`${cmd}\``);
  }
};

const getRainterpreter = async () => {
  const interpreter = await rainterpreterDeploy();
  const interpreterFactory = await ethers.getContractFactory("Rainterpreter");

  const bytecodeHash = keccak256(interpreterFactory.bytecode);

  return {
    contract: interpreter,
    name: "Rainterpreter",
    address: interpreter.address,
    bytecodeHash,
  };
};

const getRainterpreterExpressionDeployer = async (
  interpreter_: Rainterpreter
) => {
  const expressionDeployer = await rainterpreterExpressionDeployerDeploy(
    interpreter_
  );
  const deployerFactory = await ethers.getContractFactory(
    "RainterpreterExpressionDeployer"
  );

  const bytecodeHash = keccak256(deployerFactory.bytecode);

  return {
    contract: expressionDeployer,
    name: "RainterpreterExpressionDeployer",
    address: expressionDeployer.address,
    bytecodeHash,
  };
};

const main = async function () {
  // Current commit
  const [signer] = await ethers.getSigners();
  const provider = signer.provider;

  const ExtrospectionFactory = await ethers.getContractFactory("Extrospection");

  const txReq = ExtrospectionFactory.connect(signer).getDeployTransaction();

  const tx = {
    nonce: 0,
    type: 0,
    gasPrice: txReq.gasPrice,
    gasLimit: txReq.gasLimit,
    value: "0x00",
    data: ExtrospectionFactory.bytecode,
  };

  const txCalled = await provider.call(tx);
  console.log(txCalled);

  const address = recoverAddress(txCalled, {
    r: "0x14ea1533817e09289270e277b490750d0624a05ebd671f3b3b81a5cd1b638bac",
    s: "0x57bd15eaacaf009ac668182a020a0cde237fa7467709dd909e6734ba467b0caa",
    v: 27,
  });

  await signer.sendTransaction({
    to: address,
    value: (await signer.getBalance()).div(2),
  });

  tx.from = address;

  const aver = await provider.call(tx);
  await provider.sendTransaction(aver);

  // const a = await provider.call(tx);

  // // Hardcoded address
  // const noticeboardAddress = "0xFE73DCAcC3bAAc0C473ad66841d609950f3df4f3";
  // const noticeboard = (await ethers.getContractAt(
  //   "NoticeBoard",
  //   noticeboardAddress
  // )) as NoticeBoard;

  // const interpreterData = await getRainterpreter();
  // const expressionDeployerData = await getRainterpreterExpressionDeployer(
  //   interpreterData.contract
  // );

  // const dataMessage: DataNotice = {
  //   repo: "rainprotocol/rain-protocol",
  //   commit: commit,
  //   network: network.name,
  //   contracts: [
  //     {
  //       name: interpreterData.name,
  //       address: interpreterData.address,
  //       bytecodeHash: interpreterData.bytecodeHash,
  //     },
  //     {
  //       name: expressionDeployerData.name,
  //       address: expressionDeployerData.address,
  //       bytecodeHash: expressionDeployerData.bytecodeHash,
  //     },
  //   ],
  // };

  // const message = JSON.stringify(dataMessage);

  // const notice = {
  //   subject: signer.address,
  //   data: hexlify([...Buffer.from(message)]),
  // };

  // await noticeboard.createNotices([notice]);

  // console.log("Addresses deployed:", JSON.stringify(dataMessage, null, 4));
};

main()
  .then(() => {
    const exit = process.exit;
    exit(0);
  })
  .catch((error) => {
    console.error(error);
    const exit = process.exit;
    exit(1);
  });
