#!/usr/bin/env ts-node

import Ajv from "ajv";
import * as fs from "fs";
import * as path from "path";
import { format } from "prettier";
import { argv } from "process";
import { deflateSync } from "zlib";
import OpmetaSchema from "../opmeta_schema.json";

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

  if (!args.length || args.includes("--help") || args.includes("-h") || args.includes("-H")){
    console.log(
      `
      usage:
        gen-opmeta [options] <args> ./path/to/1st.opmeta.json ./path/to/2nd.opmeta.json ...

      example:
        gen-opmeta --path dest/path/name.json --schema path/to/schema.json ./path/to/1st.opmeta.json ./path/to/2nd.opmeta.json
      

      options:

        --path, -p, -P <destination/path/name.json>
          Destination of the output file. Writes to root of the current working directory if not provided.
        
        --schema, -s, -S <path/to/schema.json>
          Path to the opmeta schema, uses the default schema if not provided.
      `
    )
  }
  else {
    let dir = root;
    let schemaPath = "";
    if (args.includes("--path") || args.includes("-p") || args.includes("-P")) {
      const _i = args.indexOf("--path") > -1
        ? args.indexOf("--path")
        : args.indexOf("-p") > -1
        ? args.indexOf("-p")
        : args.indexOf("-P")
      const _tmp = args.splice(_i, _i + 2);
      dir = path.resolve(root, _tmp[1]);
    }

    if (args.includes("--schema") || args.includes("-s") || args.includes("-S")) {
      const _i = args.indexOf("--schema") > -1
        ? args.indexOf("--schema")
        : args.indexOf("-s") > -1
        ? args.indexOf("-s")
        : args.indexOf("-S")
      const _tmp = args.splice(_i, _i + 2);
      if (_tmp[1].endsWith(".json")) {
        schemaPath = path.resolve(root, _tmp[1]);
      } else throw new Error("invalid schema path");
    }

    const schema = schemaPath.length
      ? JSON.parse(readFile(schemaPath))
      : OpmetaSchema;
    const validate = new Ajv().compile(schema);

    const opmetas = [];
    if (!args.length) throw new Error("expected opmeta files")
    for (let i = 0; i < args.length; i++) {
      if (args[i].endsWith(".json")) {
        const tmp = JSON.parse(readFile(path.resolve(root, args[i])));
        if (validate(tmp)) opmetas.push(tmp);
        else throw new Error(`invalid opmeta content at index ${i}`);
      } else throw new Error(`invalid opmeta path at index ${i}`);
    }

    let opmetaHexString = "0x";
    const opmetaBytes = Uint8Array.from(
      deflateSync(format(JSON.stringify(opmetas, null, 4), { parser: "json" }))
    );
    for (let i = 0; i < opmetaBytes.length; i++) {
      opmetaHexString =
        opmetaHexString + opmetaBytes[i].toString(16).padStart(2, "0");
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
      opmeta: opmetas,
      deployableOpmetaBytes: opmetaHexString,
      deployableSchemaBytes: schemaHexString,
    };
    const fileData = format(JSON.stringify(data, null, 4), { parser: "json" });

    if (!dir.endsWith(".json")) dir = dir + "/Opmeta.json";

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
