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
  let dir = root;
  let schemaPath = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i].includes("path")) {
      let _tmp = args.splice(i, i + 1)[0];
      _tmp = _tmp.slice(_tmp.indexOf("=") + 1);
      dir = path.resolve(root, _tmp);
    }
  }
  for (let i = 0; i < args.length; i++) {
    if (args[i].includes("schema")) {
      let _tmp = args.splice(i, i + 1)[0];
      _tmp = _tmp.slice(_tmp.indexOf("=") + 1);
      if (_tmp.endsWith(".json")) {
        schemaPath = path.resolve(root, _tmp);
      } else throw new Error("invalid schema path");
    }
  }

  const schema = schemaPath.length
    ? JSON.parse(readFile(schemaPath))
    : OpmetaSchema;
  const validate = new Ajv().compile(schema);

  const opmetas = [];
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
