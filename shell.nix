let
 pkgs = import <nixpkgs> {};

 dev = pkgs.writeShellScriptBin "dev" ''
  npm run dev
 '';
in
pkgs.stdenv.mkDerivation {
 name = "shell";
 buildInputs = [ pkgs.nodejs-14_x dev ];

 shellHook = ''
  # https://ghedam.at/15978/an-introduction-to-nix-shell
  mkdir -p .nix-node
  export NODE_PATH=$PWD/.nix-node
  export NPM_CONFIG_PREFIX=$PWD/.nix-node
  export PATH=$NODE_PATH/bin:$PATH
  # keep it fresh
  npm install
 '';
}
