let
 pkgs = import <nixpkgs> {};

 dev = pkgs.writeShellScriptBin "dev" ''
  npm run dev
 '';

 mnemonic = pkgs.writeShellScriptBin "mnemonic" ''
  mnemonics
 '';

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
in
pkgs.stdenv.mkDerivation {
 name = "shell";
 buildInputs = [
  pkgs.nodejs-12_x
  dev
  mnemonic
  local-node
  local-deploy
  local-test
  local-fork
 ];

 shellHook = ''
  source .env
  export PATH=$( npm bin ):$PATH
  # keep it fresh
  npm install
 '';
}
