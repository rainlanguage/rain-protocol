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

 prettier-check = pkgs.writeShellScriptBin "prettier-check" ''
  prettier --check .
 '';

 prettier-write = pkgs.writeShellScriptBin "prettier-write" ''
  prettier --write .
 '';

 ci-lint = pkgs.writeShellScriptBin "ci-lint" ''
 solhint 'contracts/**/*.sol'
 prettier-check
 '';

 security-check = pkgs.writeShellScriptBin "security-check" ''
 # Slither does not like there being two IERC20.
 # One is from Balancer the other is from Open Zeppelin.
 # This patch swaps all the Balancer IERC20 imports with an Open Zeppelin IERC20 import.
 patch -p1 < slither-hack-balancer-ierc20.patch

 # Balancer has PoolParams struct defined inside a contract which slither does not like.
 # This patch moves PoolParams outside the contract and upates import references to it.
 patch -p1 < slither-hack-balancer-pool-params.patch
 patch -p1 < slither-hack-local-pool-params.patch

 # Workaround a slither bug due to stale compiled artifacts.
 # https://github.com/crytic/slither/issues/860
 rm -rf artifacts
 rm -rf typechain
 rm -rf cache

 # Install slither to a fresh tmp dir to workaround nix-shell immutability.
 export td=$(mktemp -d)
 python3 -m venv ''${td}/venv
 source ''${td}/venv/bin/activate
 pip install slither-analyzer

 # Run slither against all our contracts.
 # Disable npx as nix-shell already handles availability of what we nee.
 # Some contracts are explicitly out of scope for slither:
 # - The balancer configurable-rights-pool git submodule
 # - The test contracts that only exist so the test harness can drive unit tests and will never be deployed
 # - Open Zeppelin contracts
 slither . --npx-disable --filter-paths="contracts/configurable-rights-pool|contracts/test|openzeppelin" --exclude-dependencies

 # Rollback all the slither specific patches.
 patch -R -p1 < slither-hack-local-pool-params.patch
 patch -R -p1 < slither-hack-balancer-pool-params.patch
 patch -R -p1 < slither-hack-balancer-ierc20.patch
 '';

 ci-test = pkgs.writeShellScriptBin "ci-test" ''
 hardhat test
 '';

 docgen = pkgs.writeShellScriptBin "docgen" ''
 rm -rf docs/api && npm run docgen
 '';

 docs-start = pkgs.writeShellScriptBin "docs-start" ''
 docgen && npm run start --prefix docusaurus
 '';

 docs-build = pkgs.writeShellScriptBin "docs-build" ''
 docgen && npm run build --prefix docusaurus
 '';

 docs-serve = pkgs.writeShellScriptBin "docs-serve" ''
 npm run serve --prefix docusaurus
 '';

# WIP docs versioning
#  docs-version = pkgs.writeShellScriptBin "docs-version" ''
#  docs-build && npm run docusaurus --prefix docusaurus docs:version 0.0.1
#  '';
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
  prettier-check
  prettier-write
  security-check
  ci-test
  ci-lint
  docgen
  docs-start
  docs-build
  docs-serve
  # docs-version
 ];

 shellHook = ''
  export PATH=$( npm bin ):$PATH
  # keep it fresh
  npm install
  npm install --prefix docusaurus
 '';
}
