import { ethers, network } from "hardhat";
// import { rainterpreterDeploy } from "../utils/deploy/interpreter/shared/rainterpreter/deploy";
// import { rainterpreterExpressionDeployerDeploy } from "../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
// import { noticeboardDeploy } from "../utils/deploy/noticeboard/deploy";
// import { hexlify, arrayify } from "ethers/lib/utils";
import {
  execSync,
  type ExecSyncOptionsWithStringEncoding,
} from "child_process";

import type { NoticeBoard } from "../typechain";

type DataNotice = {
  name: string;
  commit: string | Buffer;
  network: string;
  addresses: {
    interpreter: string;
    expressionDeployer: string;
  };
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

const main = async function () {
  // Current commit
  const commit = exec("git rev-parse HEAD");

  const [signer] = await ethers.getSigners();

  // Hardcoded address
  const noticeboardAddress = "0xFE73DCAcC3bAAc0C473ad66841d609950f3df4f3";
  const noticeboard = (await ethers.getContractAt(
    "NoticeBoard",
    noticeboardAddress
  )) as NoticeBoard;

  const dataMessage: DataNotice = {
    name: `core`,
    commit: commit,
    network: network.name,
    addresses: {
      interpreter: "0xabc",
      expressionDeployer: "0xdef",
    },
  };

  // const message = `a test message: ${commit} - ${network.name}`;

  const message = JSON.stringify(dataMessage);

  const notice = {
    subject: signer.address,
    data: ethers.utils.hexlify([...Buffer.from(message)]),
  };

  // console.log(notice);

  await noticeboard.createNotices([notice]);

  // // noticeBoard.createNotices()
  // const interpreter = await rainterpreterDeploy();
  // data.
  // const expressionDeployer = await rainterpreterExpressionDeployerDeploy(
  //   interpreter
  // );

  /////////////////////

  // const a = Buffer.from(message);
  // const b = [...Buffer.from(message)];
  // // const c = hexlify([...Buffer.from(message)]);
  // const dataHex = hexlify([...Buffer.from(message)]);

  // console.log("Original: ");
  // console.log(message);

  // const arraified = arrayify(dataHex);
  // const buffered = Buffer.from(arraified);

  // console.log("From: ");

  // const aver = buffered.toString();

  // console.log(aver);
  // console.log(JSON.parse(aver));
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
