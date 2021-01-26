let
 pkgs = import <nixpkgs> {};

 dev = pkgs.writeShellScriptBin "dev" ''
  npm run dev
 '';

 mnemonic = pkgs.writeShellScriptBin "mnemonic" ''
  mnemonics
 '';

 ganache = pkgs.writeShellScriptBin "ganache" ''
 ganache-cli --deterministic -g 1 -l 100000000 --noVMErrorsOnRPCResponse
 '';

 deploy-poc = pkgs.writeShellScriptBin "deploy-poc" ''
 truffle migrate --reset --network development
 '';

 deploy-balancer-core = pkgs.writeShellScriptBin "deploy-balancer-core" ''
 ( cd balancer-core && truffle migrate --reset --network development )
 '';

 deploy-balancer-crp = pkgs.writeShellScriptBin "deploy-balancer-crp" ''
 ( cd configurable-rights-pool && truffle migrate --reset --network development )
 '';

 deploy-all = pkgs.writeShellScriptBin "deploy-all" ''
 deploy-balancer-core
 deploy-balancer-crp
 deploy-poc
 '';
in
pkgs.stdenv.mkDerivation {
 name = "shell";
 buildInputs = [
  pkgs.nodejs-12_x
  dev
  mnemonic
  ganache
  deploy-balancer-core
  deploy-balancer-crp
  deploy-poc
  deploy-all
 ];

 shellHook = ''
  source .env
  export PATH=$( npm bin ):$PATH
  # keep it fresh
  npm install
 '';
}
