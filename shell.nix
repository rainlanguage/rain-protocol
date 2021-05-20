let
 pkgs = import <nixpkgs> {};

 local-node = pkgs.writeShellScriptBin "local-node" ''
  hardhat node
 '';

 local-fork = pkgs.writeShellScriptBin "local-fork" ''
 hardhat node --fork https://eth-mainnet.alchemyapi.io/v2/G0Vg_iZFiAuUD6hjXqcVg-Nys-NGiTQy --fork-block-number 11833335
 '';

 local-test = pkgs.writeShellScriptBin "local-test" ''
 hardhat test --network localhost
 '';

 local-deploy = pkgs.writeShellScriptBin "local-deploy" ''
  hardhat run --network localhost scripts/deploy.ts
 '';

 ci-lint = pkgs.writeShellScriptBin "ci-lint" ''
 solhint 'contracts/**/*.sol'
 '';

 security-check = pkgs.writeShellScriptBin "security-check" ''
 rm -rf venv
 rm -rf artifacts
 rm -rf cache
 rm -rf node_modules
 npm install
 python3 -m venv venv
 source ./venv/bin/activate
 pip install slither-analyzer
 slither .
 '';

 ci-test = pkgs.writeShellScriptBin "ci-test" ''
 hardhat test
 '';
in
pkgs.stdenv.mkDerivation {
 name = "shell";
 buildInputs = [
  pkgs.nodejs-14_x
  pkgs.python3
  local-node
  local-fork
  local-test
  local-deploy
  security-check
  ci-test
  ci-lint
 ];

 shellHook = ''
  export PATH=$( npm bin ):$PATH
  # keep it fresh
  npm install
 '';
}
