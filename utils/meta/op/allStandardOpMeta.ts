import OpMetaSchema from "../../../schema/meta/v0/op.meta.schema.json";
import path from "path";
import { deflateSync } from "zlib";
import fs from "fs";
import { resolve } from "path";
import { format } from "prettier";
import { metaFromBytes, validateMeta } from "../general";

import type { BytesLike } from "ethers/lib/utils";

/**
 * Generates list of file paths for all `.opmeta.json` files under `contracts/` directory.
 */
const getOpmetaFilePaths = () => {
  const opmetaFilePaths: string[] = [];

  function fromDir(startPath: string, filter: string) {
    if (!fs.existsSync(startPath)) {
      throw new Error(`Could not find path ${startPath}`);
    }

    const files = fs.readdirSync(startPath);
    for (let i = 0; i < files.length; i++) {
      const filename = path.join(startPath, files[i]);
      const stat = fs.lstatSync(filename);
      if (stat.isDirectory()) {
        fromDir(filename, filter);
      } else if (filename.endsWith(filter)) {
        opmetaFilePaths.push(filename);
      }
    }
  }

  fromDir("./contracts", ".opmeta.json");

  return opmetaFilePaths;
};

/**
 * @public
 * All Rainterpreter opmetas
 */
export const getOpmetaList = () => {
  const opmetaFilePaths = getOpmetaFilePaths();

  const opmetaJson = [];

  for (let i = 0; i < opmetaFilePaths.length; i++) {
    const data = fs.readFileSync(opmetaFilePaths[i], { encoding: "utf8" });
    const json = JSON.parse(data);
    opmetaJson.push(json);
  }

  return opmetaJson;
};

/**
 * @public
 * All Rainterpreter opmetas
 */
export const rainterpreterOpmeta = getOpmetaList();

/**
 * @public
 * Constructs an enum-like object of opmeta names, which can be checked against the TypeScript `AllStandardOps` enum to verify it.
 */
export const getAllStandardOpsEnum = () => {
  const allStandardOps = {};

  rainterpreterOpmeta.forEach((opmeta, i_) => {
    allStandardOps[opmeta.name] = i_;
  });

  return { ...allStandardOps, length: rainterpreterOpmeta.length };
};

/**
 * @public
 * Compress and convert Rainterpreter opmetas to bytes
 * @returns hex string
 */
export const getRainterpreterOpMetaBytes = (): string => {
  if (!validateMeta(rainterpreterOpmeta, OpMetaSchema))
    throw new Error("invalid op meta");
  const opmetaBytes = Uint8Array.from(
    deflateSync(
      format(JSON.stringify(rainterpreterOpmeta, null, 4), { parser: "json" })
    )
  );
  let hex = "0x";
  for (let i = 0; i < opmetaBytes.length; i++) {
    hex = hex + opmetaBytes[i].toString(16).padStart(2, "0");
  }
  return hex;
};

/**
 * @public
 * Generate the JSON file of Rainterpsreter opmeta
 *
 * @param path - The path to write the file on, default is the current path
 * @param fileName - The name of the file, default is "RainterpreterOpmeta"
 * @returns Rainterpreter opmeta json
 */
export const getRainterpreterOpMetaJson = (
  path?: string,
  fileName?: string
) => {
  if (!path) path = __dirname;
  path = resolve(path);
  if (!fileName) fileName = "RainterpreterOpmeta";
  try {
    fs.writeFileSync(
      path + "/" + fileName + ".json",
      format(JSON.stringify(rainterpreterOpmeta, null, 4), { parser: "json" })
    );
  } catch (error) {
    console.log(error);
  }
};

/**
 * @public
 * Decompress and convert bytes to Rainterpreter op metas
 *
 * @param bytes - Bytes to decompress and convert back to json meta
 * @param path - (optional) Path to write the results to if having the output as a json file is desired
 * @returns
 */
export const getRainterpreterOpMetaFromBytes = (
  bytes: BytesLike,
  path?: string
) => {
  return metaFromBytes(bytes, OpMetaSchema, path);
};
