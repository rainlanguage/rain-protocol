import Ajv from "ajv";
import fs from "fs";
import { resolve } from "path";
import { deflateSync } from "zlib";
import OpmetaSchema from "../../../../opmeta_schema.json";


/**
 * @public
 * Get the JSON content of provided opmeta object
 * 
 * @param opmeta - array of opmeta objects (JSON.parsed)
 * @param schema - (optional) json schema as object (JSON.parsed) to validate 
 * opmetas, uses opmeta_schema.json in root folder as default
 * @returns Rainterpreter opmeta as string
 */
export const getOpmetaJsonContent = (
  opmeta: object[],
  schema?: object
): string => {
  let _schema: object
  if (schema) _schema = schema
  else _schema = OpmetaSchema
  const ajv = new Ajv()
  const validate = ajv.compile(_schema)
  const _opmeta = []
  if (opmeta.length) {
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
 * @param opmeta - array of opmeta objects (JSON.parsed)
 * @param schema - (optional) json schema as object (JSON.parsed) to validate 
 * opmetas, uses opmeta_schema.json in root folder as default
 * @returns hex string
 */
export const getOpmetaBytes = (
  opmeta: object[],
  schema?: object
): string => {
  const content = getOpmetaJsonContent(opmeta, schema)
  const opmetaBytes = Uint8Array.from(deflateSync(content))
  let opmetaHexString = "0x"
  for (let i = 0; i < opmetaBytes.length; i++) {
      opmetaHexString = 
          opmetaHexString + opmetaBytes[i].toString(16).padStart(2, "0")
  }
  return opmetaHexString

}

/**
 * @public
 * Generate the JSON file of an opmeta object
 * 
 * @param opmeta - array of opmeta objects (JSON.parsed)
 * @param schema - (optional) json schema as object (JSON.parsed) to validate 
 * opmetas, uses opmeta_schema.json in root folder as default
 * @param path - The path to write the file on, default will be the current path
 * @param fileName - The name of the file, default is "RainterpreterOpmeta"
 * @returns Rainterpreter opmeta json 
 */
export const getOpmetaJsonFile = (
  opmeta: object[],
  schema?: object,
  path?: string,
  fileName?: string
) => {
  if (!path) path = __dirname
  path = resolve(path)
  if (!fileName) fileName = "Opmeta"
  const _opmeta = getOpmetaJsonContent(opmeta, schema)
  try {
    fs.writeFileSync(
      path + fileName + ".json",
      _opmeta
    );
  } catch (error) {
    console.log(error);
  }
}

/**
 * @public Convert and compress opmeta schema to bytes for deployement
 * @param schema - (optional) schema to convert, default is opmeta_schema.json 
 * in root directory
 * @returns hex string
 */
export const getOpmetaSchemaBytes = (schema?: object): string => {
  let _schema
  if (schema) _schema = schema
  else _schema = OpmetaSchema
  const schemaJson = JSON.stringify(_schema, null, 4)
  const schemaBytes = Uint8Array.from(deflateSync(schemaJson))
  let schemaHexString = "0x"
  for (let i = 0; i < schemaBytes.length; i++) {
      schemaHexString = 
          schemaHexString + schemaBytes[i].toString(16).padStart(2, "0")
  }
  return schemaHexString
}