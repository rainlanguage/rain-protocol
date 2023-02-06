#!/usr/bin/env ts-node

import Ajv from "ajv";
import * as fs from "fs";
import * as path from "path";
import { format } from "prettier";
import { argv } from "process";
import { deflateSync } from "zlib";
import ContractMetaSchema from "../schema/meta/v0/contract.meta.schema.json";

const readFile = (_path: string) => {
  try {
    return fs.readFileSync(_path).toString();
  } catch (error) {
    throw new Error(`invalid file, reason: ${error}`);
  }
};

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
      Get deployable bytes for a contract meta.

      usage:
        contract-meta [--contract-meta] <path/to/contract-meta.json> [option1] <arg1> [option2] <arg2>

      example:
        contract-meta --dest dest/path/name.json --schema path/to/schema.json --contract-meta ./path/to/contract.meta.json


      options:

        --contract-meta, -c, -C <path/to/contract.meta.json>
          Path to a contract meta json file.

        --dest, -d, -D <destination/path/name.json>
          (optional) Destination of the output file. Only loges the Deployable Bytes in the terminal if not provided.

        --schema, -s, -S <path/to/schema.json>
          (optional) Path to the contract meta schema, uses the default schema if not provided.


      *** Path can be relative or absolute ***
          - relative path must start with letters or 1 or 2 dots ".", example: relative/path ./relative/path ../../relative/path
          - absolute path must start with slash "/", example: /absolute/path
      `
    );
  } else {
    let toWrite = false
    let dir = root;
    let schemaPath = "";
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

    if (
      args.includes("--schema") ||
      args.includes("-s") ||
      args.includes("-S")
    ) {
      const _i =
        args.indexOf("--schema") > -1
          ? args.indexOf("--schema")
          : args.indexOf("-s") > -1
          ? args.indexOf("-s")
          : args.indexOf("-S");
      const _tmp = args.splice(_i, _i + 2);
      if (_tmp.length != 2) throw new Error("expected path to the schema");
      if (_tmp[1].endsWith(".json")) {
        schemaPath = path.resolve(root, _tmp[1]);
      } else throw new Error("invalid schema, must be a valid json");
    }

    const schema = schemaPath.length
      ? JSON.parse(readFile(schemaPath))
      : ContractMetaSchema;
    const validate = new Ajv().compile(schema);

    let contractMeta;
    if (
      args.includes("--contract-meta") ||
      args.includes("-c") ||
      args.includes("-C")
    ) {
      const _i =
        args.indexOf("--contract-meta") > -1
          ? args.indexOf("--contract-meta")
          : args.indexOf("-c") > -1
          ? args.indexOf("-c")
          : args.indexOf("-C");
      const item = args.splice(_i + 1, _i + 2);
      if (item.length !== 1) throw new Error("expected path to contract meta file");
      if (item[0].endsWith(".json")) {
        const tmp = JSON.parse(readFile(path.resolve(root, item[0])));
        if (validate(tmp)) contractMeta = tmp;
        else throw new Error(`${item[0]} has invalid content`);
      } else throw new Error(`${item[0]} is not valid, must be a valid json`);

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
  Expected ContractMeta File!
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
