#!/usr/bin/env ts-node

import * as fs from "fs";
import * as path from "path";
import { argv } from "process";
import { deflateSync } from "zlib";
import OpmetaSchema from "../opmeta_schema.json";
import { rainterpreterOpmeta } from "../utils/interpreter/ops/allStandardOpmeta";

// const exec = (cmd: string) => {
//     try {
//         return execSync(cmd, { stdio: 'inherit' });
//     } catch (e) {
//         throw new Error(`Failed to run command \`${cmd}\``);
//     }
// };

const writeFile = (_path: string, file: string) => {
    try {
        fs.writeFileSync(_path, file);
    } catch (error) {
        console.log(error);
    }
}

const main = async() => {
    let opmetaHexString = "0x"
    const opmetaBytes = Uint8Array.from(deflateSync(
        JSON.stringify(rainterpreterOpmeta, null, 4)
    ))
    for (let i = 0; i < opmetaBytes.length; i++) {
        opmetaHexString = 
            opmetaHexString + opmetaBytes[i].toString(16).padStart(2, "0")
    }

    let schemaHexString = "0x"
    const schemaBytes = Uint8Array.from(deflateSync(
        JSON.stringify(OpmetaSchema, null, 4)
    ))
    for (let i = 0; i < schemaBytes.length; i++) {
        schemaHexString = 
            schemaHexString + schemaBytes[i].toString(16).padStart(2, "0")
    }

    const fileData = {
        opmeta: rainterpreterOpmeta,
        deployableOpmetaBytes: opmetaHexString,
        deployableSchemaBytes: schemaHexString
    }

    const root = path.resolve()
    let dir = root
    const args = argv.slice(2)
    if (args.length === 1) {
        dir = path.resolve(root, args[0])
    }
    if (!dir.endsWith(".json")) dir = dir + "/RainterpreterOpmeta.json"

    writeFile(dir, JSON.stringify(fileData, null, 4))
}

main().then(
    () => {
        const exit = process.exit;
        exit(0);
    }
).catch(
    (error) => {
        console.error(error);
        const exit = process.exit;
        exit(1);
    }
);
