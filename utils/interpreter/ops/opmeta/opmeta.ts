import fs from "fs";
import { deflateSync } from "zlib";

/**
 * @public
 * Compress and convert opmetas to bytes
 * 
 * @param opmeta - opmeta of type string or object
 * @param indent - indentation of opmeta to make it human readable 
 * @returns bytes
 */
export const getOpmetaBytes = (
  opmeta: string | object,
  indent?: number
): Uint8Array => {
  if (!indent) indent = 4
  if (typeof opmeta === "string") opmeta = JSON.parse(opmeta)
  return deflateSync(
      JSON.stringify(opmeta, null, indent)
  )
}

/**
 * @public
 * Get the JSON content of provided opmeta object
 * 
 * @param opmeta - opmeta of type string or object
 * @param indent - indentation of opmeta to make it human readable 
 * @returns Rainterpreter opmeta 
 */
export const getOpmetaJsonData = (
  opmeta: object,
  indent?: number
): string => {
  if (!indent) indent = 4
  return JSON.stringify(opmeta, null, indent)
}

/**
 * @public
 * Generate the JSON file of an opmeta object
 * 
 * @param opmeta - opmeta of type string or object
 * @param path - The path to write the file on, default will be the current path
 * @param fileName - The name of the file, default is "RainterpreterOpmeta"
 * @param indent - indentation of opmeta to make it human readable 
 * @returns Rainterpreter opmeta json 
 */
export const getOpmetaJsonFile = (
  opmeta: object,
  path?: string,
  fileName?: string,
  indent?: number
) => {
  if (!path) path = __dirname
  if (!path.endsWith("/")) path = path + "/"
  if (!fileName) fileName = "Opmeta"
  const OpMeta = getOpmetaJsonData(opmeta, indent)
  try {
    fs.writeFileSync(
      path + fileName + ".json",
      OpMeta
    );
  } catch (error) {
    console.log(error);
  }
}