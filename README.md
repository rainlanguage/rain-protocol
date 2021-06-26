# tv-tier

## Development setup

### Nix Shell

Nix shell is optional if you are happy to manage your own `npm` and `python`.

See the `shell.nix` file for example commands.

Install the nix shell if you haven't already.

```
curl -L https://nixos.org/nix/install | sh
```

Drop into a nix-shell.

```
cd tv-balancer
nix-shell
```

### Run tests

From _outside_ the nix-shell run:

```
nix-shell --run ci-test
```

Inside the nix-shell you can just run `ci-test` directly.

### Lint code

From _outside_ the nix-shell run:

```
nix-shell --run ci-lint
```

Inside the nix-shell you can just run `ci-lint` directly.

### Automated security checks

From _outside_ the nix-shell run:

```
nix-shell --run security-check
```

Inside the nix-shell you can just run `security-check` directly.

## ITier

`ITier` is a simple interface that contracts can implement to provide membership lists for other contracts.

### Use cases

There are many use-cases for a time-preserving, conditional membership list.

Some examples include:

- Self-serve whitelist to participate in fundraising
- Lists of users who can claim airdrops and perks
- Pooling resources with implied governance/reward tiers
- POAP style attendance proofs allowing access to future exclusive events

Etc.

### setTier

Users can set their own tier by calling `setTier`.

The contract that implements `ITier` is responsible for checking eligibility and/or taking actions required to set the tier.

For example, the contract must take/refund any tokens relevant to changing the tier.

Obviously the user is responsible for any approvals for this action prior to calling `setTier`.

When the tier is changed a `TierChange` event will be emmited as:

```
    event TierChange(address account, Tier startTier, Tier endTier);
```

The `setTier` function includes arbitrary data as the third parameter. This can be used to disambiguate in the case that there may be many possible options for a user to achieve some tier.

For example, consider the case where `THREE` can be achieved by EITHER locking 1x rare NFT or 3x uncommon NFTs. A user with both could use `data` to explicitly state their intent.

NOTE however that _any_ address can call `setTier` for any other address.
If you implement `data` or anything that changes state then be very careful to avoid griefing attacks.

The `data` parameter can also be ignored by the contract implementing `ITier`. For example, ERC20 tokens are fungible so only the balance approved by the user is relevant to a tier change.

The `setTier` function SHOULD prevent users from reassigning `ZERO` to themselves.
The `ZERO` status represents never having any status.

### report

The tier report for any account can be viewed with `report`.

A tier report is a `uint256` that contains each of the block numbers each tier has been held continously since as a `uint32`. There are 9 possible tier, starting with `ZERO` for `0` offset or "never held any tier" then working up through 8x 4 byte offsets to the full 256 bits.

Low bits = Lower tier.

In hexadecimal every 8 characters = one tier, starting at `EIGHT` from high bits and working down to `ONE`.

`uint32` should be plenty for any blockchain that measures block times in seconds, but reconsider if deploying to an environment with significantly sub-second block times.

~135 years of 1 second blocks fit into `uint32`.

`2^8 / (365 * 24 * 60 * 60)`

When a user INCREASES their tier they keep all the block numbers they already had, and get new block times for each increased tiers they have earned.

When a user DECREASES their tier they return to `0xFFFFFFFF` (never) for every tier level they remove, but keep their block numbers for the remaining tiers.

GUIs are encouraged to make this dynamic very clear for users as round-tripping to a lower status and back is a DESTRUCTIVE operation for block times.

The intent is that downstream code can provide additional benefits for members who have maintained a certain tier for/since a long time. These benefits can be provided by inspecting the report, and by on-chain contracts directly, rather than needing to work with snapshots etc.

## TierUtil

`TierUtil` implements several pure functions that can be used to interface with reports.

- `tierAtBlockFromReport`: Returns the highest status achieved relative to a block number and report.
- `tierBlock`: Returns the block that a given tier has been held since according to a report.
- `truncateTiersAbove`: Resets all the tiers above the reference tier.
- `updateBlocksForTierRange`: Updates a report with a block number for every tier in a range.
- `updateReportWithTierAtBlock`: Updates a report to a new tier.

## ReadOnlyTier

`ReadOnlyTier` is a base contract that other contracts are expected to inherit.

It does not allow `setStatus` and expects `report` to derive from some existing onchain data.

## ReadWriteTier

`ReadWriteTier` is a base contract that other contracts are expected to inherit.

It handles all the internal accounting and state changes for `report` and `setTier`.

It calls an `_afterSetTier` hook that inheriting contracts can override to enforce tier requirements.

## ERC20TransferTier

`ERC20TransferTier` inherits from `ReadWriteTier`.

In addition to the standard accounting it requires that users transfer erc20 tokens to achieve a tier.

Data is ignored, the only requirement is that the user has approved sufficient balance to gain the next tier.

To avoid griefing attacks where accounts remove tiers from arbitrary third parties, we `require(msg.sender == account_);` when a tier is removed. When a tier is added the `msg.sender` is responsible for payment.

The 8 values for gainable tiers and erc20 contract must be set upon construction and are immutable.

The `_afterSetTier` simply transfers the diff between the start/end tier to/from the user as required.

If a user sends erc20 tokens directly to the contract without calling `setTier` the FUNDS ARE LOST.

## ERC20BalanceTier

`ERC20BalanceTier` inherits from `ReadOnlyTier`.

There is no internal accounting, the balance tier simply reads the balance of the user whenever `report` is called.

`setTier` always fails.

There is no historical information so each tier will either be `0x00000000` or `0xFFFFFFFF` for the block number.

## AlwaysTier

`AlwaysTier` inherits from `ReadOnlyTier`.

Always returns every tier, i.e. `0x00000000` for every address.

## NeverTier

`NeverTier` inherits from `ReadOnlyTier`.

Never returns any tier, i.e. `0xFFFFFFFF` for every address.

## TierByConstruction

`TierByConstruction` is a base contract for other contracts to inherit from.

It exposes `isTier` and the corresponding modifier `onlyTier`.

This ensures that the address has held at least the given tier since the contract was constructed.

We check against the construction time of the contract rather than the current block to avoid various exploits.

Users should not be able to gain a tier for a single block, claim benefits then remove the tier within the same block.

The construction block provides a simple and generic reference point that is difficult to manipulate/predict.

Note that `ReadOnlyTier` contracts must carefully consider use with `TierByConstruction` as they tend to return `0x00000000` for any/all tiers held. There needs to be additional safeguards to mitigate "flash tier" attacks.

Note that an account COULD be `TierByConstruction` then lower/remove a tier, then no longer be eligible when they regain the tier. Only _continuously held_ tiers are valid against the construction block check as this is native behaviour of the `report` function in `ITier`.

Technically the `ITier` could re-enter the `TierByConstruction` so the `onlyTier` modifier runs AFTER the modified function.

## TierByConstructionClaim

`TierByConstructionClaim` is a base contract for other contracts to inherit from.

It builds on `TierByConstruction` with a `claim` function and `_afterClaim` hook.

The `claim` function checks `onlyTier` and exposes `isTier` for `_afterClaim` hooks so that accounts can self-mint rewards such as erc20, erc1155, erc721, etc. if they meet the tier requirements.

The `claim` function can only be called once per account.

Note that `claim` is an unrestricted function and only the tier of the _recipient_ is checked.

Implementing contracts must be careful to avoid griefing attacks where an attacker calls `claim` against a third party in such a way that their reward is minimised or damaged in some way.

For example, `ERC20BalanceTier` used with `TierByConstructionClaim` opens the ability for an attacker to `claim` every address they know that has not reached the minimum balance, permanently voiding that address for future claims even if they reach the minimum balance at a later date.

Another example, `data_` is set to some empty value for the `claim` that voids the ability for the recipient to receive more rewards, had the `data_` been set to some meaningful value.

Implementing contracts are encouraged to include additional restrictions such as requiring the `msg.sender` and claimant are the same address, or preapproved by the recipient, if griefing attacks are possible.