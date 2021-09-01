## `SeedERC20`






### `constructor(struct SeedERC20Config config_)` (public)

Sanity checks on configuration.
Store relevant config as contract state.
Mint all seed tokens.




### `seed(uint256 minimumUnits_, uint256 desiredUnits_)` (external)

Take reserve from seeder as units * seedPrice.

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
(units * reserve held by seed contract) / total seed token supply
= reserve transfer to `msg.sender`

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





