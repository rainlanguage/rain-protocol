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
 ];

 shellHook = ''
  source .env
  export PATH=$( npm bin ):$PATH
  # keep it fresh
  npm install
 '';
}
