`NeverTier` inherits from `ReadOnlyTier`.

Never returns any tier, i.e. `0xFFFFFFFF` for every address and tier.



## Details
`NeverTier` is intended as a primitive for combining tier contracts.

As the name implies:
- `NeverTier` is `ReadOnlyTier` and so can never call `setTier`.
- `report` is always `uint256(-1)` as every tier is unobtainable.




## Functions
### `report(address) → uint256` (public)

Every tier in the report is unobtainable.


Returns the earliest block the account has held each tier for
continuously.
This is encoded as a uint256 with blocks represented as 8x
concatenated uint32.
I.e. Each 4 bytes of the uint256 represents a u32 tier start time.
The low bits represent low tiers and high bits the high tiers.
Implementing contracts should return 0xFFFFFFFF for lost &
never-held tiers.



