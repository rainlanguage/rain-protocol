

## Details
A contract that is `VerifyTier` expects to derive tiers from the time
the account was approved by the underlying `Verify` contract. The approval
block numbers defer to `State.since` returned from `Verify.state`.

## Variables
### `contract Verify` `verify`




## Functions
### `constructor(contract Verify verify_)` (public)

Sets the `verify` contract immutably.



### `report(address account_) → uint256` (public)

Every tier will be the `State.since` block if `account_` is approved
otherwise every tier will be uninitialized.


Returns the earliest block the account has held each tier for
continuously.
This is encoded as a uint256 with blocks represented as 8x
concatenated uint32.
I.e. Each 4 bytes of the uint256 represents a u32 tier start time.
The low bits represent low tiers and high bits the high tiers.
Implementing contracts should return 0xFFFFFFFF for lost &
never-held tiers.



