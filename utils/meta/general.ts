/* eslint-disable @typescript-eslint/no-explicit-any */
import Ajv from "ajv";
import fs from "fs";
import { resolve } from "path";
import { format } from "prettier";
import { deflateSync, inflateSync } from "zlib";

/**
 * @public
 * Validate a meta or array of metas against a schema
 *
 * @param meta - A meta object or array of meta objects (JSON.parsed from meta json file)
 * @param schema - Json schema as object (JSON.parsed) to validate
 * @returns boolean
 */
export const validateMeta = (meta: any, schema: any): boolean => {
  const ajv = new Ajv();
  const validate = ajv.compile(schema);
  if (meta.length) {
    for (let i = 0; i < meta.length; i++) {
      if (!validate(meta[i])) return false;
    }
  } else {
    if (!validate(meta)) return false;
  }
  return true;
};

/**
 * @public
 * Convert meta or array of metas or a schema to bytes and compress them for on-chain deployment
 *
 * @param meta - A meta object or array of meta objects (JSON.parsed from meta json file)
 * @param schema - (optional) Json schema as object (JSON.parsed) to validate
 * @param path - (optional) The path to write the file to if generating an output json file is desired, example: path/to/name.json
 * @returns Bytes as HexString
 */
export const bytesFromMeta = (
  meta: any,
  schema?: any,
  path?: string
): string => {
  const _write = (_meta) => {
    let _path = resolve(path);
    if (!_path.endsWith(".json")) _path = _path + "Meta.json";
    try {
      fs.writeFileSync(_path, _meta);
    } catch (error) {
      console.log(error);
    }
  };

  const formatted = format(JSON.stringify(meta, null, 4), { parser: "json" });
  const bytes = Uint8Array.from(deflateSync(formatted));
  let hex = "0x";
  for (let i = 0; i < bytes.length; i++) {
    hex = hex + bytes[i].toString(16).padStart(2, "0");
  }
  if (schema) {
    if (!validateMeta(meta, schema))
      throw new Error("provided meta object is not valid");
  }
  if (path && path.length) _write(formatted);
  return hex;
};

/**
 * @public
 * Decompress and convert bytes to meta
 *
 * @param bytes - Bytes to decompress and convert to json
 * @param schema - (optional) Json schema as object (JSON.parsed) to validate
 * @param path - (optional) The path to write the file to if generating an output json file is desired, example: path/to/name.json
 * @returns meta content as object
 */
export const metaFromBytes = (
  bytes: string | Uint8Array,
  schema?: any,
  path?: string
) => {
  const _write = (_meta) => {
    let _path = resolve(path);
    if (!_path.endsWith(".json")) _path = _path + "Meta.json";
    try {
      fs.writeFileSync(_path, _meta);
    } catch (error) {
      console.log(error);
    }
  };

  let _uint8Arr: Uint8Array;
  if (typeof bytes === "string") {
    if (bytes.startsWith("0x")) bytes = bytes.slice(2);
    const _bytesArr = [];
    for (let i = 0; i < bytes.length; i += 2) {
      _bytesArr.push(Number("0x" + bytes.slice(i, i + 2)));
    }
    _uint8Arr = Uint8Array.from(_bytesArr);
  } else {
    _uint8Arr = bytes;
  }
  const _meta = format(inflateSync(_uint8Arr).toString(), { parser: "json" });

  if (schema) {
    if (!validateMeta(JSON.parse(_meta), schema))
      throw new Error("invalid meta");
  }
  if (path && path.length) _write(_meta);
  return JSON.parse(_meta);
};
