import Ajv from "ajv";
import fs from "fs";
import { resolve } from "path";
import { format } from "prettier";
import stringMath from "string-math";
import { deflateSync, inflateSync } from "zlib";
import { arrayify, BytesLike, isBytesLike } from "ethers/lib/utils";

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
    const _len = bits[1] - bits[0] + 1;
    const _result = [];
    for (let i = 0; i < _len; i++) {
      _result.push(bits[0] + i);
    }
    return _result;
  };
  let _meta;
  let _schema;
  if (typeof meta === "string") _meta = JSON.parse(meta);
  else _meta = meta;
  if (typeof schema === "string") _schema = JSON.parse(schema);
  else _schema = schema;
  const ajv = new Ajv();
  const validate = ajv.compile(_schema);
  if (!Array.isArray(_meta)) _meta = [_meta];

  const _allAliases = [];
  for (let i = 0; i < _meta.length; i++) {
    // validate by schema
    if (!validate(_meta[i]))
      throw new Error(
        `invalid meta for ${_meta[i].name}, reason: failed schema validation`
      );

    // in-depth validation for op meta
    if (
      "operand" in _meta[i] &&
      "inputs" in _meta[i] &&
      "outputs" in _meta[i]
    ) {
      let hasOperandArg = false;
      let hasInputOperandArg = false;
      let hasInputOperandArgComp = false;
      let hasOutputOperandArg = false;
      let hasOutputOperandArgComp = false;

      // cache all aliases for check across all ops
      _allAliases.push(_meta[i].name);
      if (_meta[i].aliases) _allAliases.push(..._meta[i].aliases);

      // check for operand args validity
      if (typeof _meta[i].operand !== "number") {
        hasOperandArg = true;
        let check = true;
        for (let j = 0; j < _meta[i].operand.length; j++) {
          if (_meta[i].operand[j].name === "inputs") {
            if (hasInputOperandArg)
              throw new Error(
                `invalid meta for ${_meta[i].name}, reason: double "inputs" named operand args`
              );
            hasInputOperandArg = true;
            if ("computation" in _meta[i].operand[j])
              hasInputOperandArgComp = true;
          }
          if (_meta[i].operand[j].name === "outputs") {
            if (hasOutputOperandArg)
              throw new Error(
                `invalid meta for ${_meta[i].name}, reason: double "outputs" named operand args`
              );
            hasOutputOperandArg = true;
            if ("computation" in _meta[i].operand[j])
              hasOutputOperandArgComp = true;
          }

          // check computation validity
          if ("computation" in _meta[i].operand[j]) {
            let _comp = _meta[i].operand[j].computation;
            _comp = _comp.replace(/arg/g, "30");
            try {
              stringMath(_comp);
            } catch {
              throw new Error(
                `invalid meta for ${_meta[i].name}, reason: bad "computation" equation for ${_meta[i].operand[j].name}`
              );
            }
          }
          // bits range validity
          if (_meta[i].operand[j].bits[0] > _meta[i].operand[j].bits[1])
            throw new Error(
              `invalid meta for ${_meta[i].name}, reason: start bit greater than end bit for ${_meta[i].operand[j].name}`
            );
          // check bits
          const _range1 = _expandBits(_meta[i].operand[j].bits);
          for (let k = j + 1; k < _meta[i].operand.length; k++) {
            // check order of operand args by bits index from high bits to low
            if (_meta[i].operand[j].bits[0] <= _meta[i].operand[k].bits[1]) {
              throw new Error(
                `invalid meta for ${_meta[i].name}, reason: bad operand args order, should be from high to low`
              );
            }
            // check operand args bits overlap
            const _range2 = _expandBits(_meta[i].operand[k].bits);
            _range1.forEach((v) => {
              if (_range2.includes(v)) check = false;
            });
            if (!check)
              throw new Error(
                `invalid meta for ${_meta[i].name}, reason: operand args bits overlap`
              );
          }
        }
      }

      // check for inputs bits and computation validity and validity against operand
      if (typeof _meta[i].inputs !== "number") {
        // check validity against operand
        if (hasInputOperandArg) {
          if (!("bits" in _meta[i].inputs))
            throw new Error(
              `invalid meta for ${_meta[i].name}, reason: must have specified "bits" field for inputs`
            );
          if (hasInputOperandArgComp) {
            if (!("computation" in _meta[i].inputs))
              throw new Error(
                `invalid meta for ${_meta[i].name}, reason: must have specified "computation" field for inputs`
              );
          } else {
            if ("computation" in _meta[i].inputs)
              throw new Error(
                `invalid meta for ${_meta[i].name}, reason: unexpected "computation" field for inputs`
              );
          }
        } else {
          if ("bits" in _meta[i].inputs || "computation" in _meta[i].inputs)
            throw new Error(
              `invalid meta for ${_meta[i].name}, reason: unexpected "bits" or "computation" fields for inputs`
            );
        }
        // check bits range validity
        if ("bits" in _meta[i].inputs) {
          if (_meta[i].inputs.bits[0] > _meta[i].inputs.bits[1])
            throw new Error(
              `invalid meta for ${_meta[i].name}, reason: start bit greater than end bit for inputs`
            );
        }
        // check computation validity
        if ("computation" in _meta[i].inputs) {
          let _comp = _meta[i].inputs.computation;
          _comp = _comp.replace(/bits/g, "30");
          try {
            stringMath(_comp);
          } catch {
            throw new Error(
              `invalid meta for ${_meta[i].name}, reason: bad "computation" equation for inputs`
            );
          }
        }
      } else {
        if (hasInputOperandArg)
          throw new Error(
            `invalid meta for ${_meta[i].name}, reason: unexpected input type, must be derived from bits`
          );
      }

      // check for outputs bits and computation validity and validity against operand
      if (typeof _meta[i].outputs !== "number") {
        // check validity against operand
        if (!hasOperandArg)
          throw new Error(
            `invalid meta for ${_meta[i].name}, reason: cannot have computed output`
          );
        if (hasOutputOperandArg) {
          if (hasOutputOperandArgComp) {
            if (!("computation" in _meta[i].outputs))
              throw new Error(
                `invalid meta for ${_meta[i].name}, reason: must have specified "computation" field for outputs`
              );
          } else {
            if ("computation" in _meta[i].outputs)
              throw new Error(
                `invalid meta for ${_meta[i].name}, reason: unexpected "computation" field for outputs`
              );
          }
        }
        // check bits range validity
        if (_meta[i].outputs.bits[0] > _meta[i].outputs.bits[1])
          throw new Error(
            `invalid meta for ${_meta[i].name}, reason: start bit greater than end bit for outputs`
          );
        // check computation validity
        if ("computation" in _meta[i].outputs) {
          let _comp = _meta[i].outputs.computation;
          _comp = _comp.replace(/bits/g, "30");
          try {
            stringMath(_comp);
          } catch {
            throw new Error(
              `invalid meta for ${_meta[i].name}, reason: bad "computation" equation for outputs`
            );
          }
        }
      } else {
        if (hasOutputOperandArg)
          throw new Error(
            `invalid meta for ${_meta[i].name}, reason: unexpected output type, must be derived from bits`
          );
      }
    }
  }

  // check for overlap among all aliases
  if (_allAliases.length) {
    while (_allAliases.length) {
      const _item = _allAliases.splice(0, 1)[0];
      if (_allAliases.includes(_item))
        throw new Error(
          `invalid meta, reason: duplicated names or aliases "${_item}"`
        );
    }
  }
  return true;
};

/**
 * @public
 * Convert meta or array of metas or a schema to bytes and compress them for on-chain deployment
 *
 * @param meta - A meta object or array of meta objects or stringified format of them
 * @param schema - Json schema to validate as object (JSON.parsed) or stringified format
 * @param path - (optional) The path to write the file to if generating an output
 * json file is desired, example: path/to/name.json
 * @returns Bytes as HexString
 */
export const bytesFromMeta = (
  meta: object | object[] | string,
  schema: object | string,
  path = ""
): string => {
  const _write = (_meta: any) => {
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
  let _meta;
  let _schema;
  if (typeof meta === "string") _meta = JSON.parse(meta);
  else _meta = meta;
  if (typeof schema === "string") _schema = JSON.parse(schema);
  else _schema = schema;
  if (!validateMeta(_meta, _schema))
    throw new Error("provided meta object is not valid");
  const formatted = format(JSON.stringify(_meta, null, 4), { parser: "json" });
  const hex = deflateJson(_meta);
  if (path.length) _write(formatted);
  return hex;
};

/**
 * @public
 * Decompress and convert bytes to meta
 *
 * @param bytes - Bytes to decompress and convert to json
 * @param schema - Json schema to validate as object (JSON.parsed) or stringified format
 * @param path - (optional) The path to write the file to if generating an output
 * json file is desired, example: path/to/name.json
 * @returns meta content as object
 */
export const metaFromBytes = (
  bytes: BytesLike,
  schema: object | string,
  path = ""
) => {
  const _write = (_meta: any) => {
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
  if (isBytesLike(bytes)) {
    let _schema;
    if (typeof schema === "string") _schema = JSON.parse(schema);
    else _schema = schema;
    const _meta = inflateJson(bytes);
    if (!validateMeta(JSON.parse(_meta), _schema))
      throw new Error("invalid meta");
    if (path.length) _write(_meta);
    return JSON.parse(_meta);
  } else throw new Error("invalid meta");
};

/**
 * @public
 * Take a Object and parset it to a JSON to be deflated and returned as hex string.
 *
 * @param data_ The data object to be encoded
 * @returns An hex string
 */
export const deflateJson = (data_: any): string => {
  const content = format(JSON.stringify(data_, null, 4), { parser: "json" });

  return "0x" + deflateSync(content).toString("hex");
};

/**
 * @public
 * `WIP:` Inverse of `deflateJson`. Get a hex string  or Uint8Array and inflate
 * the JSON to obtain an string with the decoded data.
 *
 * @param bytes - Bytes to infalte to json
 */
export const inflateJson = (bytes: BytesLike): string => {
  if (!isBytesLike(bytes)) throw new Error("invalid bytes");
  const _uint8Arr = arrayify(bytes, { allowMissingPrefix: true });
  return format(inflateSync(_uint8Arr).toString(), { parser: "json" });
};
