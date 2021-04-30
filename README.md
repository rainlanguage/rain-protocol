# tv-prestige

## IPrestige

`IPrestige` is a simple interface that contracts can implement to provide membership lists for other contracts.

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

The contract that implements `IPrestige` is responsible for checking eligibility and/or taking actions required to set the status.

For example, the contract must take/refund any tokens relevant to changing the status.

Obviously the user is responsible for any approvals for this action prior to calling `setStatus`.

When the status is changed a `StatusChange` event will be emmited as:

```
    event StatusChange(address account, Status[2] change);
```

With the old/new statuses as `[old, new]` in the `Status[2]`.

The `setStatus` function includes arbitrary data as the third parameter. This can be used to disambiguate in the case that there may be many possible options for a user to achieve some status.

For example, consider the case where `GOLD` can be achieved by EITHER locking 1x rare NFT or 3x uncommon NFTs. A user with both could use `data` to explicitly state their intent.

The `data` parameter can also be ignored by the contract implementing `IPrestige`. For example, ERC20 tokens are fungible so only the balance approved by the user is relevant to a status change.

### statusReport

The status report for any account can be viewed with `statusReport`.

A status report is a `uint256` that contains each of the block numbers each status has been held continously since as a `uint32`.

Low bits = Lower status.

In hexadecimal every 8 characters = one status, starting at `JAWAD` and working down to `COPPER`.

`uint32` should be plenty for any blockchain that measures block times in seconds, but reconsider if deploying to an environment with significantly sub-second block times.

~135 years of 1 second blocks fit into `uint32`.

`2^8 / (365 * 24 * 60 * 60)`

When a user INCREASES their status the keep all the block numbers they already had, and get new block times for each increased status they have earned.

When a user DECREASES their status they return to ZERO for every status level they remove, but keep their block numbers for the remaining statuses.

GUIs are encouraged to make this dynamic very clear for users as round-tripping to a lower status and back is a DESTRUCTIVE operation for block times.

The intent is that downstream code can provide additional benefits for members who have maintained a certain tier for/since a long time. These benefits can be provided by inspecting the status report, and by on-chain contracts directly, rather than needing to work with snapshots etc.

## TVKPrestige

`TVKPrestige` is the first implementation of `IPrestige`.

It has 8 hardcoded TVK levels for each status:

- `COPPER`: 0 TVK
- `BRONZE`: 1000 TVK
- `SILVER`: 5000 TVK
- `GOLD`: 10 000 TVK
- `PLATINUM`: 25 000 TVK
- `DIAMOND`: 100 000 TVK
- `CHAD`: 250 000 TVK
- `JAWAD`: 1 000 000 TVK

The contract address for TVK is also hardcoded into `TVKPrestige`.

There is no constructor.
The contract has no parameters.
The contract cannot be reused for other membership schemes as-is.
There is no admin functionality.

The `setStatus` function simply:

- builds the new status report for the user
- emits the `StatusChange` event
- transfers the diff between the old/new status to/from the user as required

THIS CONTRACT KEEPS NO RECORD OF USER TRANSFERS.

__ANY TOKENS SEND DIRECTLY TO THE CONTRACT WITHOUT CALLING `setStatus` ARE LOST FOREVER.__