`AlwaysTier` inherits from `ReadOnlyTier`.

Always returns every tier, i.e. `0x00000000` for every address and tier.



## Details
`AlwaysTier` is intended as a primitive for combining tier contracts.

As the name implies:
- `AlwaysTier` is `ReadOnlyTier` and so can never call `setTier`.
- `report` is always `0x00000000` for every tier and every address.




## Functions
### `report(address) → uint256` (public)

Every address is always every tier.


Returns the earliest block the account has held each tier for
continuously.
This is encoded as a uint256 with blocks represented as 8x
concatenated uint32.
I.e. Each 4 bytes of the uint256 represents a u32 tier start time.
The low bits represent low tiers and high bits the high tiers.
Implementing contracts should return 0xFFFFFFFF for lost &
never-held tiers.



