`ReadWriteTier` is a base contract that other contracts are
expected to inherit.

It handles all the internal accounting and state changes for `report`
and `setTier`.

It calls an `_afterSetTier` hook that inheriting contracts can override to
enforce tier requirements.



## Details
ReadWriteTier can `setTier` in addition to generating reports.
When `setTier` is called it automatically sets the current blocks in the
report for the new tiers. Lost tiers are scrubbed from the report as tiered
addresses move down the tiers.

## Variables
### `mapping(address => uint256)` `reports`




## Functions
### `report(address account_) → uint256` (public)

Either fetch the report from storage or return UNINITIALIZED.


Returns the earliest block the account has held each tier for
continuously.
This is encoded as a uint256 with blocks represented as 8x
concatenated uint32.
I.e. Each 4 bytes of the uint256 represents a u32 tier start time.
The low bits represent low tiers and high bits the high tiers.
Implementing contracts should return 0xFFFFFFFF for lost &
never-held tiers.



### `setTier(address account_, enum ITier.Tier endTier_, bytes data_)` (external)

Errors if the user attempts to return to the `Tier.ZERO` tier.
Updates the report from `report` using default `TierUtil` logic.
Calls `_afterSetTier` that inheriting contracts SHOULD override to
enforce status requirements.
Emits `TierChange` event.


Updates the tier of an account.

The implementing contract is responsible for all checks and state
changes required to set the tier. For example, taking/refunding
funds/NFTs etc.

Contracts may disallow directly setting tiers, preferring to derive
reports from other onchain data.
In this case they should `revert("SET_TIER");`.



### `_afterSetTier(address account_, enum ITier.Tier startTier_, enum ITier.Tier endTier_, bytes data_)` (internal)

Inheriting contracts SHOULD override this to enforce requirements.

All the internal accounting and state changes are complete at
this point.
Use `require` to enforce additional requirements for tier changes.





