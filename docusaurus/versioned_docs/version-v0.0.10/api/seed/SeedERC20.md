Facilitates raising seed reserve from an open set of seeders.

When a single seeder address cannot be specified at the time the
`Trust` is constructed a `SeedERC20` will be deployed.

The `SeedERC20` has two phases:

- `Phase.ZERO`: Can swap seed tokens for reserve assets with
`seed` and `unseed`
- `Phase.ONE`: Can redeem seed tokens pro-rata for reserve assets

When the last seed token is distributed the `SeedERC20`
immediately moves to `Phase.ONE` atomically within that
transaction and forwards all reserve to the configured recipient.

For our use-case the recipient is a `Trust` contract but `SeedERC20`
could be used as a mini-fundraise contract for many purposes. In the case
that a recipient is not a `Trust` the recipient will need to be careful not
to fall afoul of KYC and securities law.



## Details
Facilitates a pool of reserve funds to forward to a named recipient
contract.
The funds to raise and the recipient is fixed at construction.
The total is calculated as `( seedPrice * seedUnits )` and so is a fixed
amount. It is recommended to keep seedUnits relatively small so that each
unit represents a meaningful contribution to keep dust out of the system.

The contract lifecycle is split into two phases:

- `Phase.ZERO`: the `seed` and `unseed` functions are callable by anyone.
- `Phase.ONE`: holders of the seed erc20 token can redeem any reserve funds
  in the contract pro-rata.

When `seed` is called the `SeedERC20` contract takes ownership of reserve
funds in exchange for seed tokens.
When `unseed` is called the `SeedERC20` contract takes ownership of seed
tokens in exchange for reserve funds.

When the last `seed` token is transferred to an external address the
`SeedERC20` contract immediately:

- Moves to `Phase.ONE`, disabling both `seed` and `unseed`
- Transfers the full balance of reserve from itself to the recipient
  address.

Seed tokens are standard ERC20 so can be freely transferred etc.

The recipient (or anyone else) MAY transfer reserve back to the `SeedERC20`
at a later date.
Seed token holders can call `redeem` in `Phase.ONE` to burn their tokens in
exchange for pro-rata reserve assets.

## Variables
### `contract IERC20` `reserve`

### `address` `recipient`

### `uint256` `seedPrice`




## Functions
### `constructor(struct SeedERC20Config config_)` (public)

Sanity checks on configuration.
Store relevant config as contract state.
Mint all seed tokens.




### `seed(uint256 minimumUnits_, uint256 desiredUnits_)` (external)

Take reserve from seeder as `units * seedPrice`.

When the final unit is sold the contract immediately:

- enters `Phase.ONE`
- transfers its entire reserve balance to the recipient

The desired units may not be available by the time this transaction
executes. This could be due to high demand, griefing and/or
front-running on the contract.
The caller can set a range between `minimumUnits_` and `desiredUnits_`
to mitigate errors due to the contract running out of stock.
The maximum available units up to `desiredUnits_` will always be
processed by the contract. Only the stock of this contract is checked
against the seed unit range, the caller is responsible for ensuring
their reserve balance.
Seeding enforces the cooldown configured in the constructor.




### `unseed(uint256 units_)` (external)

Send reserve back to seeder as `( units * seedPrice )`.

Allows addresses to back out until `Phase.ONE`.
Unlike `redeem` the seed tokens are NOT burned so become newly
available for another account to `seed`.

In `Phase.ONE` the only way to recover reserve assets is:
- Wait for the recipient or someone else to deposit reserve assets into
  this contract.
- Call redeem and burn the seed tokens





### `redeem(uint256 units_)` (external)

Burn seed tokens for pro-rata reserve assets.

```
(units * reserve held by seed contract) / total seed token supply
= reserve transfer to `msg.sender`
```

The recipient or someone else must first transfer reserve assets to the
`SeedERC20` contract.
The recipient MUST be a TRUSTED contract or third party.
This contract has no control over the reserve assets once they are
transferred away at the start of `Phase.ONE`.
It is the caller's responsibility to monitor the reserve balance of the
`SeedERC20` contract.

For example, if `SeedERC20` is used as a seeder for a `Trust` contract
(in this repo) it will receive a refund or refund + fee.




### `_beforeScheduleNextPhase(uint32 nextPhaseBlock_)` (internal)

Sanity check the last phase is `Phase.ONE`.




