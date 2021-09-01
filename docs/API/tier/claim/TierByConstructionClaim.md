## `TierByConstructionClaim`






### `constructor(contract ITier tierContract_, enum ITier.Tier minimumTier_)` (public)

Nothing special needs to happen in the constructor.
Simply forwards the desired ITier contract in the TierByConstruction constructor.
The minimum tier is set for later reference.



### `claim(address account_, bytes data_)` (external)

The onlyTier modifier checks the claimant against minimumTier.
The ITier contract decides for itself whether the claimant is minimumTier as at the current block.number
The claim can only be done once per account.

NOTE: This function is callable by anyone and can only be called once per account.
The `_afterClaim` function can and SHOULD enforce additional restrictions on when/how a claim is valid.
Be very careful to manage griefing attacks when the `msg.sender` is not `account_`, for example:
- An `ERC20BalanceTier` has no historical information so anyone can claim for anyone else based on their balance at any time.
- `data_` may be set arbitrarily by `msg.sender` so could be consumed frivilously at the expense of `account_`.





### `_afterClaim(address account_, uint256 report_, bytes data_)` (internal)

Implementing contracts need to define what is claimed.




### `Claim(address account, bytes data_)`

A claim has been successfully processed for an account.



