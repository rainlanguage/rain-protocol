let
  pkgs = import
    (builtins.fetchTarball {
      name = "nixos-unstable-2022-12-18";
      url = "https://github.com/nixos/nixpkgs/archive/5c4da4dbba967c43b846bca65b6e879fbf9fde83.tar.gz";
      sha256 = "sha256:1lbkw6152a3ibjpy3qakpfgrldqzyddxyfmxxgq45pvizfk6xdd1";
    })
    { };

  prettier-check = pkgs.writeShellScriptBin "prettier-check" ''
    prettier --check .
  '';

  prettier-write = pkgs.writeShellScriptBin "prettier-write" ''
    prettier --write .
  '';

  ci-lint = pkgs.writeShellScriptBin "ci-lint" ''
    flush-all
    npm install
    solhint 'contracts/**/*.sol'
    prettier-check
    npm run lint
  '';

  flush-all = pkgs.writeShellScriptBin "flush-all" ''
    rm -rf artifacts
    rm -rf cache
    rm -rf node_modules
    rm -rf typechain
    rm -rf bin
    rm -rf crytic-export
  '';

  security-check = pkgs.writeShellScriptBin "security-check" ''
    flush-all
    npm install

    # Run slither against all our contracts.
    # Disable npx as nix-shell already handles availability of what we need.
    # Dependencies and tests are out of scope.
    slither . --npx-disable --filter-paths="contracts/test,node_modules" --exclude-dependencies --fail-high
  '';


  cut-dist = pkgs.writeShellScriptBin "cut-dist" ''
    flush-all
    npm install

    hardhat compile --force
    dir=`git rev-parse HEAD`
    mkdir -p "dist/''${dir}"
    mv artifacts "dist/''${dir}/"
    mv typechain "dist/''${dir}/"

    mv solt "dist/''${dir}/"
  '';

  ci-test = pkgs.writeShellScriptBin "ci-test" ''
    flush-all
    npm install
    hardhat compile --force
    hardhat test --parallel --bail
  '';

  ci-deployment = pkgs.writeShellScriptBin "ci-deployment" ''
    # Generate JSON description input to verification

    # Deploying to given <network>
    if [[ ''$1 == "" ]]; then
      echo "should specify a network"
    else
      hardhat run deployment/index.ts --network ''$1
    fi
  '';

  run-echidna = pkgs.writeShellScriptBin "run-echidna" ''
    # Init solc only before runnign echidna to save time
    init-solc

    find echidna -name '*.sol' | xargs -i sh -c '
      file="{}";
      configFile=''${file%%.*}.yaml;

      if ! [ -e $configFile ]; then
        configFile=echidna/default.yaml;
      fi;

      echidna-test $file --contract "$(basename -s .sol $file)" --config $configFile
    '
  '';

  init-solc = pkgs.writeShellScriptBin "init-solc" ''
    # Change the version
    solcVersion='0.8.18';

    # Use and print message to be notice that use the correct version
    solc-select use $solcVersion

    if [[ $(solc-select use $solcVersion) =~ "You need to install '$solcVersion' prior to using it." ]]; then
      solc-select install $solcVersion;
      solc-select use $solcVersion;
    fi
  '';

  prepack = pkgs.writeShellScriptBin "prepack" ''
    set -euo pipefail
    shopt -s globstar

    flush-all

    npm install
    npm run build

    cp artifacts/contracts/**/*.json artifacts
    rm -rf artifacts/*.dbg.json
    rm -rf artifacts/*Test*
    rm -rf artifacts/*Reentrant*
    rm -rf artifacts/*ForceSendEther*
    rm -rf artifacts/*Mock*
  '';

  prepublish = pkgs.writeShellScriptBin "prepublish" ''
    npm version patch --no-git-tag-version
    PACKAGE_NAME=$(node -p "require('./package.json').name")
    PACKAGE_VERSION=$(node -p "require('./package.json').version")
    cat << EOF


    Package version for $PACKAGE_NAME bumped to $PACKAGE_VERSION

    Please manually commit this change, and push up to the GitHub repo:

    $ git commit -am "$PACKAGE_VERSION"
    $ git push

    Now, you should either:
    - tag this commit locally and push it up
    - remotely cut a release on the GitHub repo (if you're having issues tagging the commit locally)

    Locally:
    $ git tag v$PACKAGE_VERSION -am "$PACKAGE_VERSION"
    $ git push origin v$PACKAGE_VERSION

    Remotely:
    Go to Releases -> Draft a new release
    Select this branch and create a new release with the following tag: v$PACKAGE_VERSION


    EOF
  '';

  rainterpreter-opmeta = pkgs.writeShellScriptBin "rainterpreter-opmeta" ''
    ts-node ./scripts/getRainterpreterOpmeta.ts ''$@
  '';

  opmeta = pkgs.writeShellScriptBin "opmeta" ''
    ts-node ./scripts/getOpmeta.ts ''$@
  '';

  rain-contract-meta = pkgs.writeShellScriptBin "rain-contract-meta" ''
    ts-node ./scripts/getRainContractMeta.ts ''$@
  '';

  contract-meta = pkgs.writeShellScriptBin "contract-meta" ''
    ts-node ./scripts/getContractMeta.ts ''$@
  '';

in
pkgs.stdenv.mkDerivation {
  name = "shell";
  buildInputs = [
    pkgs.watch
    pkgs.nixpkgs-fmt
    pkgs.nodejs-16_x
    pkgs.slither-analyzer
    prettier-check
    prettier-write
    security-check
    run-echidna
    ci-test
    ci-lint
    ci-deployment
    cut-dist
    prepack
    prepublish
    flush-all
    # Echidna config
    init-solc
    pkgs.cloc
    pkgs.python39Packages.solc-select
    pkgs.python39Packages.crytic-compile
    pkgs.echidna
    rainterpreter-opmeta
    opmeta
    contract-meta
    rain-contract-meta
  ];

  shellHook = ''
    export PATH=$( npm bin ):$PATH
    # keep it fresh
    npm install
  '';
}
