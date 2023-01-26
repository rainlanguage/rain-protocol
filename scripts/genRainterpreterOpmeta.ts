#!/usr/bin/env ts-node

//import * as fs from "fs";
// import { argv } from "process";
// import { deflateSync } from "zlib";
import { execSync } from "child_process";
// import { getOpmetaJsonData } from "../utils";
// import { rainterpreterOpmeta } from "../utils/interpreter/ops/allStandardOpmeta";

const exec = (cmd: string) => {
    try {
        return execSync(cmd, { stdio: 'inherit' });
    } catch (e) {
        throw new Error(`Failed to run command \`${cmd}\``);
    }
};

// const writeFile = (_path: string, file: any) => {
//   try {
//     fs.writeFileSync(_path, file);
//   } catch (error) {
//     console.log(error);
//   }
// }

// const readFile = (_path: string) => {
//   try {
//     return fs.readFileSync(_path).toString();
//   } catch (error) {
//     return "";
//   }
// };

const main = async() => {
    // const opmeta = JSON.stringify(rainterpreterOpmeta, null, 4)
    // const dir = "./contracts/interpreter/ops/"
    // if (readFile("./contracts/interpreter/ops/AllStandardOpmeta.json")) {
    //     writeFile("./contracts/interpreter/ops/AllStandardOpmeta.json", opmeta)
    // }
    // else {
    //     exec("touch ./contracts/interpreter/ops/AllStandardOpmeta.json")
    //     writeFile("./contracts/interpreter/ops/AllStandardOpmeta.json", opmeta)
    // }
    exec("pwd")
    console.log(__dirname)
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
