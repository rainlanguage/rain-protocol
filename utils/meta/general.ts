/* eslint-disable @typescript-eslint/no-explicit-any */
import Ajv from "ajv";
import fs from "fs";
import { resolve } from "path";
import { format } from "prettier";
import stringMath from "string-math";
import { deflateSync, inflateSync } from "zlib";


/**
 * @public
 * Validate a meta or array of metas against a schema
 *
 * @param meta - A meta object or array of meta objects or stringified format of them
 * @param schema - Json schema to validate as object (JSON.parsed) or stringified format
 * @returns boolean
 */
export const validateMeta = (
  meta: object | object[] | string,
  schema: object | string
): boolean => {
  const _expandBits = (bits: [number, number]) => {
    const _len = bits[1] - bits[0] + 1
    const _result = []
    for (let i = 0; i < _len; i++) {
      _result.push(bits[0] + i)
    }
    return _result
  }
  let _meta
  let _schema
  if (typeof meta === "string") _meta = JSON.parse(meta)
  else _meta = meta
  if (typeof schema === "string") _schema = JSON.parse(schema)
  else _schema = schema
  const ajv = new Ajv();
  const validate = ajv.compile(_schema);
  if (!Array.isArray(_meta)) _meta = [_meta]

  const _allAliases = []
  for (let i = 0; i < _meta.length; i++) {

    // validate by schema
    if (!validate(_meta[i])) return false;

    // in-depth validation for op meta
    if ("operand" in _meta[i] && "inputs" in _meta[i] && "outputs" in _meta[i]) {

      // cache all aliases for check across all ops
      _allAliases.push(_meta[i].name)
      if (_meta[i].aliases) _allAliases.push(..._meta[i].aliases)

      // check for operand args validity
      if (typeof _meta[i].operand !== "number") {
        let check = true
        for (let j = 0; j < _meta[i].operand.length; j++) {
          // check computation validity
          if ("computation" in _meta[i].operand[j]) {
            let _comp = _meta[i].operand[j].computation
            while (_comp.includes("arg")) _comp = _comp.replace("arg", "30")
            try { stringMath(_comp) }
            catch { return false }
          }
          // bits range validity
          if (_meta[i].operand[j].bits[0] > _meta[i].operand[j].bits[1]) return false
          // check bits overlap
          const _range1 = _expandBits(_meta[i].operand[j].bits)
          for (let k = j + 1; k < _meta[i].operand.length; k++) {
            const _range2 = _expandBits(_meta[i].operand[k].bits)
            _range1.forEach(v => {
              if (_range2.includes(v)) check = false
            })
            if (!check) return false
          }
        }
      }

      // check for inputs bits and computation validity
      if (typeof _meta[i].inputs !== "number") {
        // check bits range validity
        if ("bits" in _meta[i].inputs) {
          if (_meta[i].inputs.bits[0] > _meta[i].inputs.bits[1]) return false
        }
        // check computation validity
        if ("computation" in _meta[i].inputs) {
          let _comp = _meta[i].inputs.computation
          while (_comp.includes("bits")) _comp = _comp.replace("bits", "30")
          try { stringMath(_comp) }
          catch { return false }
        }
      }

      // check for outputs bits and computation validity
      if (typeof _meta[i].outputs !== "number") {
        // check bits range validity
        if (_meta[i].outputs.bits[0] > _meta[i].outputs.bits[1]) return false
        // check computation validity
        if ("computation" in _meta[i].outputs) {
          let _comp = _meta[i].outputs.computation
          while (_comp.includes("bits")) _comp = _comp.replace("bits", "30")
          try { stringMath(_comp) }
          catch { return false }
        }
      }
    }
  }

  // check for overlap among all aliases
  if (_allAliases.length) {
    while (_allAliases.length) {
      const _item = _allAliases.splice(0, 1)[0]
      if (_allAliases.includes(_item)) return false;
    }
  }
  return true;
};

/**
 * @public
 * Convert meta or array of metas or a schema to bytes and compress them for on-chain deployment
 *
 * @param meta - A meta object or array of meta objects or stringified format of them
 * @param schema - (optional) Json schema to validate as object (JSON.parsed) or stringified format
 * @param path - (optional) The path to write the file to if generating an output json file is desired, example: path/to/name.json
 * @returns Bytes as HexString
 */
export const bytesFromMeta = (
  meta: object | object[] | string,
  schema?: object | string,
  path?: string
): string => {
  const _write = (_meta) => {
    if (path) {
      let _path = resolve(path);
      if (!_path.endsWith(".json")) _path = _path + "Meta.json";
      try {
        fs.writeFileSync(_path, _meta);
      } catch (error) {
        console.log(error);
      }
    }
  };
  if (schema) {
    if (!validateMeta(meta, schema))
      throw new Error("provided meta object is not valid");
  }
  const formatted = format(JSON.stringify(meta, null, 4), { parser: "json" });
  const bytes = Uint8Array.from(deflateSync(formatted));
  let hex = "0x";
  for (let i = 0; i < bytes.length; i++) {
    hex = hex + bytes[i].toString(16).padStart(2, "0");
  }
  if (path && path.length) _write(formatted);
  return hex;
};

/**
 * @public
 * Decompress and convert bytes to meta
 *
 * @param bytes - Bytes to decompress and convert to json
 * @param schema - (optional) Json schema to validate as object (JSON.parsed) or stringified format
 * @param path - (optional) The path to write the file to if generating an output json file is desired, example: path/to/name.json
 * @returns meta content as object
 */
export const metaFromBytes = (
  bytes: string | Uint8Array,
  schema?: object | string,
  path?: string
) => {
  const _write = (_meta) => {
    if (path) {
      let _path = resolve(path);
      if (!_path.endsWith(".json")) _path = _path + "Meta.json";
      try {
        fs.writeFileSync(_path, _meta);
      } catch (error) {
        console.log(error);
      }
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
