#!/usr/bin/env ts-node --

import * as fs from "fs";
import * as path from "path";
import { argv } from "process";
import { deflateSync } from "zlib";
import { format } from "prettier";
import OpmetaSchema from "../schema/meta/v0/op.meta.schema.json";
import { rainterpreterOpmeta } from "../utils/meta/op/allStandardOpMeta";

const writeFile = (_path: string, file: string) => {
  try {
    fs.writeFileSync(_path, file);
  } catch (error) {
    console.log(error);
  }
};

const main = async () => {
  const root = path.resolve();
  let dir = root;
  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-h") || args.includes("-H")) {
    console.log(
      `
      Get deployable bytes for Rainterpreter opcodes.

      usage:
        rainterpreter-opmeta <destination/path/name.json>

      ** Only logs the Deployable Bytes if no path was provided for the output file

      *** Path can be relative(from the current working directory) or absolute:
      - relative path must start with letters or 1 or 2 dots ".", example: relative/path ./relative/path ../../relative/path
      - absolute path must start with slash "/", example: /absolute/path
      `
    );
  } else {
    let opmetaHexString = "0x";
    const opmetaBytes = Uint8Array.from(
      deflateSync(
        format(JSON.stringify(rainterpreterOpmeta, null, 4), { parser: "json" })
      )
    );
    for (let i = 0; i < opmetaBytes.length; i++) {
      opmetaHexString =
        opmetaHexString + opmetaBytes[i].toString(16).padStart(2, "0");
    }

    let schemaHexString = "0x";
    const schemaBytes = Uint8Array.from(
      deflateSync(
        format(JSON.stringify(OpmetaSchema, null, 4), { parser: "json" })
      )
    );
    for (let i = 0; i < schemaBytes.length; i++) {
      schemaHexString =
        schemaHexString + schemaBytes[i].toString(16).padStart(2, "0");
    }

    const data = {
      deployableOpmetaBytes: opmetaHexString,
      deployableSchemaBytes: schemaHexString,
      opmeta: rainterpreterOpmeta,
    };
    const fileData = format(JSON.stringify(data, null, 4), { parser: "json" });

    if (args.length === 1) {
      dir = path.resolve(root, args[0]);
      if (!dir.endsWith(".json")) dir = dir + "/RainterpreterOpmeta.json";
      writeFile(dir, fileData);
    } else if (args.length > 1) throw new Error("invalid arguments");

    console.log(`
Deployable Opmeta Bytes: 
${opmetaHexString}

`);
    console.log(`
Deployable Opmeta Schema Bytes: 
${schemaHexString}

`);
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
