`ERC20BalanceTier` inherits from `ReadOnlyTier`.

There is no internal accounting, the balance tier simply reads the balance
of the user whenever `report` is called.

`setTier` always fails.

There is no historical information so each tier will either be `0x00000000`
or `0xFFFFFFFF` for the block number.



## Details
The `ERC20BalanceTier` simply checks the current balance of an erc20
against tier values. As the current balance is always read from the erc20
contract directly there is no historical block data.
All tiers held at the current value will be 0x00000000 and tiers not held
will be 0xFFFFFFFF.
`setTier` will error as this contract has no ability to write to the erc20
contract state.

Balance tiers are useful for:
- Claim contracts that don't require backdated tier holding
  (be wary of griefing!).
- Assets that cannot be transferred, so are not eligible for
  `ERC20TransferTier`.
- Lightweight, realtime checks that encumber the tiered address
  as little as possible.

## Variables
### `contract IERC20` `erc20`




## Functions
### `constructor(contract IERC20 erc20_, uint256[8] tierValues_)` (public)





### `report(address account_) → uint256` (public)

Report simply truncates all tiers above the highest value held.


Returns the earliest block the account has held each tier for
continuously.
This is encoded as a uint256 with blocks represented as 8x
concatenated uint32.
I.e. Each 4 bytes of the uint256 represents a u32 tier start time.
The low bits represent low tiers and high bits the high tiers.
Implementing contracts should return 0xFFFFFFFF for lost &
never-held tiers.



