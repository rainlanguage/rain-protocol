# tv-prestige

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

### setStatus

Users can set their own status by calling `setStatus`.

The contract that implements `ITier` is responsible for checking eligibility and/or taking actions required to set the status.

For example, the contract must take/refund any tokens relevant to changing the status.

Obviously the user is responsible for any approvals for this action prior to calling `setStatus`.

When the status is changed a `StatusChange` event will be emmited as:

```
    event StatusChange(address account, Status[2] change);
```

With the old/new statuses as `[old, new]` in the `Status[2]`.

The `setStatus` function includes arbitrary data as the third parameter. This can be used to disambiguate in the case that there may be many possible options for a user to achieve some status.

For example, consider the case where `THREE` can be achieved by EITHER locking 1x rare NFT or 3x uncommon NFTs. A user with both could use `data` to explicitly state their intent.

The `data` parameter can also be ignored by the contract implementing `ITier`. For example, ERC20 tokens are fungible so only the balance approved by the user is relevant to a status change.

The `setStatus` function SHOULD prevent users from reassigning `NIL` to themselves.
The `NIL` status represents never having any status.

### statusReport

The status report for any account can be viewed with `statusReport`.

A status report is a `uint256` that contains each of the block numbers each status has been held continously since as a `uint32`. There are 9 possible statuses, starting with `NIL` for `0` offset or "never held any status" then working up through 8x 4 byte offsets to the full 256 bits.

Low bits = Lower status.

In hexadecimal every 8 characters = one status, starting at `JAWAD` and working down to `COPPER`.

`uint32` should be plenty for any blockchain that measures block times in seconds, but reconsider if deploying to an environment with significantly sub-second block times.

~135 years of 1 second blocks fit into `uint32`.

`2^8 / (365 * 24 * 60 * 60)`

When a user INCREASES their status the keep all the block numbers they already had, and get new block times for each increased status they have earned.

When a user DECREASES their status they return to ZERO for every status level they remove, but keep their block numbers for the remaining statuses.

GUIs are encouraged to make this dynamic very clear for users as round-tripping to a lower status and back is a DESTRUCTIVE operation for block times.

The intent is that downstream code can provide additional benefits for members who have maintained a certain tier for/since a long time. These benefits can be provided by inspecting the status report, and by on-chain contracts directly, rather than needing to work with snapshots etc.

## TierUtil

`TierUtil` implements several pure functions that can be used to interface with status reports.

- `statusAtFromReport`: Returns the highest status achieved relative to a block number and status report.
- `statusBlock`: Returns the block that a given status has been held since according to a status report.
- `truncateStatusesAbove`: Resets all the statuses above the reference status.
- `updateBlocksForStatusRange`: Updates a report with a block number for every status integer in a range.
- `updateReportWithStatusAtBlock`: Updates a report to a new status.

## Prestige

`Prestige` is a base contract that other contracts are expected to inherit.

It handles all the internal accounting and state changes for `statusReport` and `setStatus`.

It calls an `_afterSetStatus` hook that inheriting contracts can override to enforce status requirements.

## TVKPrestige

`TVKPrestige` is the first contract inheriting from `Tier`.

In addition to the standard accounting it requires that users lock `TVK` tokens to achieve a status.

It has 8 hardcoded TVK levels for each non-ZERO status:

- `ONE`: 0 TVK
- `TWO`: 1000 TVK
- `THREE`: 5000 TVK
- `FOUR`: 10 000 TVK
- `FIVE`: 25 000 TVK
- `SIX`: 100 000 TVK
- `SEVEN`: 250 000 TVK
- `EIGHT`: 1 000 000 TVK

The contract address for TVK is also hardcoded into `TVKPrestige`.

There is no constructor.
The contract has no parameters.
The contract cannot be reused for other membership schemes as-is.
There is no admin functionality.

The `_afterSetStatus` simply transfers the diff between the old/new status to/from the user as required.

THIS CONTRACT KEEPS NO RECORD OF USER TRANSFERS.

__ANY TOKENS SEND DIRECTLY TO THE CONTRACT WITHOUT CALLING `setStatus` ARE LOST FOREVER.__

## TierByConstruction

`TierByConstruction` is a base contracts that other contracts are expected to inherit.

It provides a check `isTier` and modifier `onlyTier` to enforce tiers.

The `ITier` contract and reference block is set during construction.

For an account to have a status it must have had the status at least one block BEFORE the `TierByConstruction` contract was constructed and then held the status through to the CURRENT result of `statusReport` as per the `ITier`.

The construction block is referenced against the current status as a simple guard against things like flash loans that can be used to temporarily gain priviledges for a very short period of time at little or no cost.

Technically the `ITier` could re-enter the `TierByConstruction` so the `onlyTier` modifier runs AFTER the modified function.