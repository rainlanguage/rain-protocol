# Rain Protocol

Rain Protocol lets you build web3 economies at any scale.

Rain includes:

- Token generation with premint AND algorithmic emissions schedule
- Definitions for time-based membership systems (up to 8 tiers)
- Bootstrapping projects and tokens via. algorithmic sales that safely rollback
  if preset targets are not met
- Tokenomics and trading engines to define primary market mechanisms such as
  distributions, buybacks, price peg maintenance, etc.
- KYC/AML verification contracts that have compatible interfaces to be used in
  combination with membership requirements
- Onchain/offchain CMS style functionality to enable metadata and other content
  about contracts to be emitted onchain and indexed offchain
- Staking contract to allow like for like deposits and rewards paid prorata for
  users, while simultaneously being eligible for multiple consuming memberships
- An algorithmic membership combinator that can mix and match any combination
  of memberships
- Escrow contract to allow many tokens to be distributed to sale participants
  automatically upon sale success, or returned to the depositor on failure.
- Factory contracts for all the above to ensure efficient and safe deployments

Much of the magic of Rain is due to the "Rain VM" which is a simple way to
define and run algorithms onchain.

The Rain VM is not really a separate VM, it still uses the EVM of course, which
makes it fully compatible with all EVM chains.

Rain scripts are a combination of low level functions (opcodes) like addition
and subtraction and very high level functions like fetching an ERC20 balance at
a given snapshot ID (Open Zeppelin), or fetching a chainlink oracle price.

Rain scripts can be expressed in a spreadsheet like syntax and importantly are
deployed as part of configuration. Rain scripts do NOT need to be compiled,
unlike Solidity which needs to be compiled directly to EVM bytecode. Typically
rain scripts are deployed as onchain code even though the EVM cannot execute
them directly. The overhead of the VM is a mere ~6.6k to load a script and 170
gas per opcode, meaning that VM contracts are only ~5-10% more expensive than
hand-written and optimised equivalent solidity code.

We believe the power of allowing your USERS to read and write their own
contracts, without needing soliditiy developers or auditors, is well worth a
few thousand gas overhead, even on L1.

## How can Rain claim to bypass developers and auditors securely?

At a high level the Rain security model is:

- Lindy (value x time) is the most important measure of security
- There are NO admin keys outside the KYC verification process which sadly
  still requires some kind of offchain review
- Rain scripts MUST be both readable and writeable by the "average" spreadsheet
  user, so that ALL scriptable functionaly is _self auditable_ by end users
- Rain scripts MUST be read only so that state changes are mediated by the
  wrapping contract at all times, and reentrancy mistakes are impossible
- Rain deployments are mediated by factories with known bytecode that deploy
  known bytecode, allowing users to verify the bytecode of a factory and trust
  it based on its Lindy score on ANY evm compatible chain without needing to
  trust the Rain developers to manage deployments
- Open source dashboards are developed and maintained that can be hosted
  locally or on IPFS to mitigate MIM/phishing/DNS attacks, the dashboards show
  the Rain scripts for ANY contract deployed by known bytecode factories AND
  warn the user about unknown bytecode, so that any lying frontend can be
  quickly and easily cross-referenced with the dashboard
- An open source javascript simulator of the Rain VM is developed and
  maintained so that the behaviour of any algorithm can be analysed offchain,
  e.g. via monte carlo statistical models, or integrations with spreadsheeting
  tools.
- An open source subgraph is maintained to allow all functionality to be fully
  indexed and queried consistently at all times
- ALL required infrastructure and participants for Rain ecosystems are
  incentivised by the system and fully open to participate in, e.g. indexers
  are subgraphs, sales set aside fees for all front ends, trade clearance bots
  earn bounties, etc. so there are NO altruistic or unsustainable tokenomic
  requirements from the rain protocol itself.
- Rain makes it much easier to express sustainable tokenomics than ponzis and
  other unsustainable models, such as building in fee based revenue models

In summary front ends are expected to compete on brand, trust, UX and price for
users.

Users are expected to read/write rain scripts to deploy their own contracts
with factories and standard dashboards.

Rain scripts are expected to be intelligible to the "average spreadsheet user"
while remaining gas efficient and secure enough to be written by non-devs, and
read by other users.

If users can write their own scripts they don't need devs.

If users can read other people's scripts they don't need auditors.

## Consuming Rain in downstream contracts

As tags and branches are both mutable in git we strongly recommend referencing
git commits directly.

In package.json this can be done by adding a line like the following to
the dependencies:

```
"@beehiveinnovation/rain-protocol": "git+https://github.com/beehive-innovation/rain-protocol.git#<COMMIT_HASH_HERE>",
```

Generally we recommend using an audited commit WITH REMEDIATIONS but often this
may be several months behind the latest functionality. All security sensitive
decisions are your own.

## Installation

We strongly recommend using the nix shell https://nix.dev/tutorials/install-nix

Once you have installed nix you can simply run `nix-shell` from the root of
this repository and it will ensure a compatible version of npm is on your path
and run npm install automatically.

If you don't use nix shell then you will need to figure out for yourself what
versions of npm are compatible with the repo. Reading the `shell.nix` file may
give clues.

## Documentation

Documentation can be found [here](https://beehive-innovation.github.io/rain-protocol).

### Run tests

Run `hardhat test` from inside the nix shell.

### Run security check

Inside the nix-shell run `security-check` which will run slither as an
automated security scanner.

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

### Gas optimisations

Hardhat is configured to leverage the solidity compiler optimizer and report on
gas usage for all test runs.

In general clarity and reuse of existing standard functionality, such as
Open Zeppelin RBAC access controls, is preferred over micro-optimisation of gas
costs.

There ARE some hot performance paths such as the VM and bulk verification logic
that have aggressive assembly level gas optimisations. These optimisations
includes things like direct function pointers for VM dispatch logic and
structural sharing for potentially large lists to avoid memory expansion. It is
much more aggressive than simply bypassing some checked math for the oft-quoted
~15% assembly benefit, with savings of ~60%+ in some cases.

### Unit tests

All functionality is unit tested. The tests are in the `test` folder.

If some functionality or potential exploit is missing a test this is a bug and
so an issue and/or PR should be raised.