#!/usr/bin/env ts-node

import * as fs from "fs";
import * as path from "path";
import { format } from "prettier";
import { argv } from "process";
import { deflateSync } from "zlib";
import ContractMetaSchema from "../schema/meta/v0/contract.meta.schema.json";
import FlowERC20 from "../contracts/flow/erc20/FlowERC20Factory.meta.json";
import FlowERC721 from "../contracts/flow/erc721/FlowERC721Factory.meta.json";
import FlowERC1155 from "../contracts/flow/erc1155/FlowERC1155Factory.meta.json";
import Lobby from "../contracts/lobby/LobbyFactory.meta.json";
import Orderbook from "../contracts/orderbook/OrderBook.meta.json";
import Sale from "../contracts/sale/SaleFactory.meta.json";
import Stake from "../contracts/stake/StakeFactory.meta.json";
import CombineTier from "../contracts/tier/CombineTierFactory.meta.json";
import AutoApprove from "../contracts/verify/auto/AutoApproveFactory.meta.json";

const writeFile = (_path: string, file: string) => {
  try {
    fs.writeFileSync(_path, file);
  } catch (error) {
    console.log(error);
  }
};

const main = async () => {
  const root = path.resolve();
  const args = argv.slice(2);

  if (
    !args.length ||
    args.includes("--help") ||
    args.includes("-h") ||
    args.includes("-H")
  ) {
    console.log(
      `
      Get deployable bytes for a Rain contract meta.

      usage:
        rain-contract-meta [--name] <Rain contract name> [option] <arg>

      example:
        rain-contract-meta --name sale --dest dest/path/name.json


      options:

        --name, -n, -N <Rain contract name>
          Name of a Rain contract (case insensitive), which are: flow20, flow721, flow1155, orderbook, lobby, sale, stake, combinetier or autoapprove

        --dest, -d, -D <destination/path/name.json>
          (optional) Destination of the output file. Only loges the Deployable Bytes in the terminal if not provided.


      *** Path can be relative(from the current working directory) or absolute:
          - relative path must start with letters or 1 or 2 dots ".", example: relative/path ./relative/path ../../relative/path
          - absolute path must start with slash "/", example: /absolute/path
      `
    );
  } else {
    let toWrite = false
    let dir = root;
    if (args.includes("--dest") || args.includes("-d") || args.includes("-D")) {
      toWrite = true
      const _i =
        args.indexOf("--dest") > -1
          ? args.indexOf("--dest")
          : args.indexOf("-d") > -1
          ? args.indexOf("-d")
          : args.indexOf("-D");
      const _tmp = args.splice(_i, _i + 2);
      if (_tmp.length != 2) throw new Error("expected destination path");
      dir = path.resolve(root, _tmp[1]);
    }

    const schema = ContractMetaSchema;

    let contractMeta;
    if (
      args.includes("--name") ||
      args.includes("-n") ||
      args.includes("-N")
    ) {
      const _i =
        args.indexOf("--name") > -1
          ? args.indexOf("--name")
          : args.indexOf("-n") > -1
          ? args.indexOf("-n")
          : args.indexOf("-N");
      const item = args.splice(_i + 1, _i + 2);
      if (item.length !== 1) throw new Error("expected Rain contract name");
      if (item[0].toLocaleLowerCase() === "sale") contractMeta = Sale
      else if (item[0].toLocaleLowerCase() === "stake") contractMeta = Stake
      else if (item[0].toLocaleLowerCase() === "orderbook") contractMeta = Orderbook
      else if (item[0].toLocaleLowerCase() === "flow20") contractMeta = FlowERC20
      else if (item[0].toLocaleLowerCase() === "flow721") contractMeta = FlowERC721
      else if (item[0].toLocaleLowerCase() === "flow1155") contractMeta = FlowERC1155
      else if (item[0].toLocaleLowerCase() === "lobby") contractMeta = Lobby
      else if (item[0].toLocaleLowerCase() === "autoapprove") contractMeta = AutoApprove
      else if (item[0].toLocaleLowerCase() === "combinetier") contractMeta = CombineTier
      else throw new Error(`${item[0]} is not a valid Rain contract with contract meta`)

      let contractMetaHexString = "0x";
      const opmetaBytes = Uint8Array.from(
        deflateSync(
          format(JSON.stringify(contractMeta, null, 4), { parser: "json" })
        )
      );
      for (let i = 0; i < opmetaBytes.length; i++) {
        contractMetaHexString =
          contractMetaHexString + opmetaBytes[i].toString(16).padStart(2, "0");
      }

      let schemaHexString = "0x";
      const schemaBytes = Uint8Array.from(
        deflateSync(format(JSON.stringify(schema, null, 4), { parser: "json" }))
      );
      for (let i = 0; i < schemaBytes.length; i++) {
        schemaHexString =
          schemaHexString + schemaBytes[i].toString(16).padStart(2, "0");
      }

      const data = {
        deployableContractMetaBytes: contractMetaHexString,
        deployableSchemaBytes: schemaHexString
      };
      if (toWrite) {
        const fileData = format(JSON.stringify(data, null, 4), {
          parser: "json",
        });

        if (!dir.endsWith(".json")) dir = dir + "/ContractMetaBytes.json";

        writeFile(dir, fileData);
      }
      console.log(`
Deployable ContractMeta Bytes: 
${contractMetaHexString}

`)
      console.log(`
Deployable ContractMeta Schema Bytes: 
${schemaHexString}

`)
    } else
      console.log(
        `
  Expected Rain Contract Name!
  `
      );
  }
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
