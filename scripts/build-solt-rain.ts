const fs = require("fs");
// This path is constant after each compile
const referenceBuild = "artifacts/contracts/trust/TrustFactory.sol/TrustFactory.dbg.json";

// Obtain the right build-info path from TrustFactory: artifacts/build-info/hash.json
const buildPath = `artifacts/${fetchFile(referenceBuild).buildInfo.replace(/\.\.\//g, "")}`

// Getting the compiler input
const input = fetchFile(buildPath).input;

writeFile("solc-input-rainprotocol.json", JSON.stringify(input, null, 4));

// Auxiliar functions
function fetchFile(_path) {
  try {
    return JSON.parse(fs.readFileSync(_path).toString())
  } catch (error) {
    console.log(error)
    return {}
  }
}

function writeFile(_path, file) {
  try {
    fs.writeFileSync(_path, file);
  } catch (error) {
    console.log(error)
  }
}