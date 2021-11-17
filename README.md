# Rain Protocol

Rain Protocol supports permissionless and fair value capture for intangible or
physical assets in on any EVM compatible chain with sufficiently low fees.

## Installation

```console
npm install @beehiveinnovation/rain-protocol
```

## Usage

### Importing contracts

```solidity
pragma solidity ^0.6.12;

import "@beehiveinnovation/rain-protocol/contracts/ReadWriteTier.sol";

contract MyContract is ReadWriteTier {
  // ...
}
```

### Importing contract [artifact](https://hardhat.org/guides/compile-contracts.html#artifacts) (e.g. abi, bytecode)

```typescript
const trustJson = require("@beehiveinnovation/rain-protocol/artifacts/Trust.json");
```

### Using with [TypeChain](https://github.com/dethcrypto/TypeChain)

```typescript
import type { Trust } from "@beehiveinnovation/rain-protocol/typechain/Trust";
```

## Documentation

Documentation can be found [here](https://beehive-innovation.github.io/rain-protocol).

## Development setup (for contributors)

### Nix Shell

Install the nix shell if you haven't already.

```
curl -L https://nixos.org/nix/install | sh
```

Drop into a nix-shell.

```
cd rain-protocol
nix-shell
```

### Run tests

From _outside_ the nix-shell run:

```
nix-shell --run 'hardhat test'
```

Inside the nix-shell you can just run `hardhat test` as normal.

### Run security check

Inside the nix-shell run `security-check`.

### Build and serve documentation site

Inside the nix-shell run `docs-dev`. If you want to see search functionality,
you'll need to manually build and serve with `docs-build` and then `docs-serve`
since search indexing only runs for production builds.

Navigate to http://localhost:3000/ to view the docs site generated with
Docusaurus.

Documentation files are written in Markdown and can be found under the `docs/`
directory in this repo. The main config file can be found at
`docusaurus/docusaurus.config.js`, and sidebar config at
`docusaurus/siderbars.js`

### Publish npm Package

Inside nix-shell run `prepublish`

This will bump package version for to a new patch version,

Please manually commit this change, and push up to the GitHub repo:

```console
$ git commit -am "0.0.1"
$ git push
```

Now, you can either tag this commit locally and push it up, or directly cut a release on the GitHub repo (if you're having issues tagging the commit locally)

Locally:
```console
git tag v0.0.1 -am "0.0.1"
git push origin v0.0.1
```

Remotely:
Go to Releases -> Draft a new release
Select this branch and create a new tag for this commit e.g. `v0.0.1`

### Build deployment artifacts

Deployment artifacts are built and committed to `dist` periodically for commits
alongside relevant audits.

`solt` is used to build all the metadata used by etherscan etc. to verify the
contract bytecode.

`solt` must be installed manually as it currently has no nix package.

`solt-the-earth` can be run inside `nix-shell` to iterate over all artifacts
and build metadata for each. If metadata is built for the entire repo then all
test contracts and other unrelated contracts will be included in what is
displayed on etherscan. This isn't dangerous but it is noisy if someone wants
to review the contract code outside the repository.

IMPORTANT NOTE: `solt` does not support `import` statements that break over
several lines. For this reason all `import` statements over 80 characters long
are explicitly ignored by solhint for line length issues.

### Audits

Audits can be found in the `audits` folder.

### Gas optimisations

Hardhat is configured to leverage the solidity compiler optimizer and report on
gas usage for all test runs.

In general clarity and reuse of existing standard functionality, such as
Open Zeppelin RBAC access controls, is preferred over micro-optimisation of gas
costs.

For many desirable use-cases, such as small independent artists or rural
communities, the gas costs on ethereum mainnet will ALWAYS be unaffordable no
matter how much we optimise these contracts.

The intent is to keep a reasonable balance between cost and clarity then deploy
the contracts to L2 solutions such as Polygon where the baseline gas cost is
several orders of magnitude cheaper.

### Unit tests

All functionality is unit tested. The tests are in the `test` folder.

If some functionality or potential exploit is missing a test this is a bug and
so an issue and/or PR should be raised.

## Roadmap

Our goal is to build a free and open source system that makes it as easy and
affordable as possible for creators to deploy `Trust` contracts that are secure
and can meet local laws and regulations, without positioning ourselves as the
gatekeeper of every possible use-case.

The current roadmap towards this goal:

- [x] Create the basic contracts needed to facilitate each phase
- [x] Audit and open source everything in a combined public repository
- [x] Create factory contracts that register deployed contracts and allow for
      automatic verification of the authenticity of a `Trust`
- [x] More KYC/AML tools for creators
- [ ] Create SDKs and incentives to foster global permissionless CURATION of
      raises across many independent GUIs, platforms and blockchains
- [ ] Facilitate Token Lists and Kleros style layers of additional CURATION to
      protect users and platforms from illicit activities
- [ ] More distribution mechanisms
- [ ] Data analytics and tools for better CURATION
- [ ] RainVM compiler for building small smart contract DSLs
