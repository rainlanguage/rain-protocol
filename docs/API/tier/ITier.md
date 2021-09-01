## `ITier`






### `setTier(address account, enum ITier.Tier endTier, bytes data)` (external)

Updates the tier of an account.

The implementing contract is responsible for all checks and state changes required to set the tier.
For example, taking/refunding funds/NFTs etc.

Contracts may disallow directly setting tiers, preferring to derive reports from other onchain data.
In this case they should `revert("SET_TIER");`.





### `report(address account) → uint256` (external)

Returns the earliest block the account has held each tier for continuously.
This is encoded as a uint256 with blocks represented as 8x concatenated u32.
I.e. Each 4 bytes of the uint256 represents a u32 tier start time.
The low bits represent low tiers and high bits the high tiers.
Implementing contracts should return 0xFFFFFFFF for lost & never-held tiers.






### `TierChange(address account, enum ITier.Tier startTier, enum ITier.Tier endTier)`

Every time a Tier changes we log start and end Tier against the account.
This MAY NOT be emitted if reports are being read from the state of an external contract.



