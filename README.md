# Terra Virtua Balancer INFURA_PROJECT_ID

## Setup

### Nix Shell

Install the nix shell if you haven't already.

```
curl -L https://nixos.org/nix/install | sh
```

Drop into a nix-shell.

```
cd tv-balancer-poc
nix-shell
```

### Ethereum private key

Generate a new mnemonic with the `mnemonic` command in the nix shell.

Create a `.env` file as:

```
#!/usr/bin/env bash
export MNEMONIC={{ your new mnemonic here }}
```

### Infura credentials

Create a new infura project, add the details to `.env` file as:

```
export INFURA_PROJECT_ID={{ infura project id }}
export INFURA_SECRET={{ infura secret }}
export INFURA_NEWORK={{ ropsten etc. }}
```

### See accounts for mnemonic

There is a script wrapping `getAccounts()`.

```
truffle exec --network ropsten scripts/getAccounts.js
```

### Add some ETH from the faucet

##### Goerli

Goerli is POA so is reliable but unrealistic.

Faucets:

- https://goerli-faucet.slock.it/
- https://faucet.goerli.mudit.blog/

#### Ropsten

Ropsten is POW and so can be unreliable.

There is a script to top up all the accounts.

```
truffle exec --network ropsten script/faucetAccounts.js
```

Don't spam this or you will be blocked.
