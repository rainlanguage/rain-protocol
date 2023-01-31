#!/usr/bin/env ts-node --

import * as fs from "fs";
import * as path from "path";
import { argv } from "process";
import { deflateSync } from "zlib";
import { format } from "prettier";
import OpmetaSchema from "../opmeta_schema.json";
import { rainterpreterOpmeta } from "../utils/interpreter/ops/allStandardOpmeta";

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
      usage:
        gen-rainterpreter-opmeta <destination/path/name.json>

      ** Writes to root of the current workiing directory if no destination path provided.
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
      opmeta: rainterpreterOpmeta,
      deployableOpmetaBytes: opmetaHexString,
      deployableSchemaBytes: schemaHexString,
    };
    const fileData = format(JSON.stringify(data, null, 4), { parser: "json" });

    if (args.length === 1) {
      dir = path.resolve(root, args[0]);
    } else if (args.length > 1) throw new Error("invalid arguments");
    if (!dir.endsWith(".json")) dir = dir + "/RainterpreterOpmeta.json";

    writeFile(dir, fileData);
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
