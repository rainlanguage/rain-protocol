import path from "path";
import { deflateSync } from "zlib";
import fs from "fs";
import { resolve } from "path";
import { format } from "prettier";

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
export const getRainterpreterOpmetaBytes = (): string => {
  const opmetaBytes = Uint8Array.from(
    deflateSync(
      format(JSON.stringify(rainterpreterOpmeta, null, 4), { parser: "json" })
    )
  );
  let opmetaHexString = "0x";
  for (let i = 0; i < opmetaBytes.length; i++) {
    opmetaHexString =
      opmetaHexString + opmetaBytes[i].toString(16).padStart(2, "0");
  }
  return opmetaHexString;
};

/**
 * @public
 * Generate the JSON file of Rainterpreter opmeta
 *
 * @param path - The path to write the file on, default is the current path
 * @param fileName - The name of the file, default is "RainterpreterOpmeta"
 * @returns Rainterpreter opmeta json
 */
export const getRainterpreterOpmetaJson = (
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
