import { ethers, network } from "hardhat";
import { rainterpreterDeploy } from "../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployerDeploy } from "../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
// import { noticeboardDeploy } from "../utils/deploy/noticeboard/deploy";
import { hexlify } from "ethers/lib/utils";
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

  const interpreter = await rainterpreterDeploy();

  const expressionDeployer = await rainterpreterExpressionDeployerDeploy(
    interpreter
  );

  const dataMessage: DataNotice = {
    name: "core",
    commit: commit,
    network: network.name,
    addresses: {
      interpreter: interpreter.address,
      expressionDeployer: expressionDeployer.address,
    },
  };

  const message = JSON.stringify(dataMessage);

  const notice = {
    subject: signer.address,
    data: hexlify([...Buffer.from(message)]),
  };

  await noticeboard.createNotices([notice]);

  console.log("Addresses deployed:", JSON.stringify(dataMessage, null, 4));
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
