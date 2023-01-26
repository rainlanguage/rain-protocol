import Ajv from "ajv";
import fs from "fs";
import { deflateSync } from "zlib";
import OpmetaSchema from "../../../../opmeta_schema.json";

const readFile = (path: string) => {
  try {
    return fs.readFileSync(path).toString();
  } catch (error) {
    return "";
  }
};

/**
 * @public
 * Get the JSON content of provided opmeta object
 * 
 * @param opmeta - array of opmeta directories or objects
 * @param schema - (optional) schema directory ot object to validate opmetas 
 * against, uses default opmeta_schema.json in root folder if not provided
 * @returns Rainterpreter opmeta as string
 */
export const getOpmetaJsonData = (
  opmeta: string[] | object[],
  schema?: string | object
): string => {
  let _schema: object
  if (schema) {
    if (typeof schema === "string") {
      const _fetched = readFile(schema)
      if (_fetched.length) _schema = JSON.parse(_fetched)
      else throw new Error("invalid schema")
    }
    else _schema = schema
  }
  else _schema = OpmetaSchema
  const ajv = new Ajv()
  const validate = ajv.compile(_schema)
  const _opmeta = []
  if (opmeta.length) {
    if (typeof opmeta[0] === "string") {
      for (let i = 0; i < opmeta.length; i++) {
        const _item = readFile(opmeta[i] as string)
        if (_item.length) {
          opmeta[i] = JSON.parse(_item)
        }
        else throw new Error(`invalid directory or file at index ${i}`)
      }
    }
    for (let i = 0; i < opmeta.length; i++) {
      if (validate(opmeta[i])) {
        _opmeta.push(opmeta[i])
      }
      else throw new Error(`invalid opmeta at index ${i}`)
    }
  }
  return JSON.stringify(_opmeta, null, 4)
}

/**
 * @public
 * Compress and convert opmetas to bytes
 * 
 * @param opmeta - array of opmeta directories or objects
 * @param schema - (optional) schema directory ot object to validate opmetas 
 * against, uses default opmeta_schema.json in root folder if not provided
 * @returns bytes
 */
export const getOpmetaBytes = (
  opmeta: string[] | object[],
  schema?: string | object
): Uint8Array => {
  const data = getOpmetaJsonData(opmeta, schema)
  return deflateSync(data)
}

/**
 * @public
 * Generate the JSON file of an opmeta object
 * 
 * @param opmeta - array of opmeta directories or objects
 * @param schema - (optional) schema directory ot object to validate opmetas 
 * against, uses default opmeta_schema.json in root folder if not provided
 * @param path - The path to write the file on, default will be the current path
 * @param fileName - The name of the file, default is "RainterpreterOpmeta"
 * @returns Rainterpreter opmeta json 
 */
export const getOpmetaJsonFile = (
  opmeta: string[] | object[],
  schema?: string | object,
  path?: string,
  fileName?: string
) => {
  if (!path) path = __dirname
  if (!path.endsWith("/")) path = path + "/"
  if (!fileName) fileName = "Opmeta"
  const _opmeta = getOpmetaJsonData(opmeta, schema)
  try {
    fs.writeFileSync(
      path + fileName + ".json",
      _opmeta
    );
  } catch (error) {
    console.log(error);
  }
}
console.log(OpmetaSchema)