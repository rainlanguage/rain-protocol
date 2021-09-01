## `ERC20TransferTier`






### `constructor(contract IERC20 erc20_, uint256[8] tierValues_)` (public)





### `_afterSetTier(address account_, enum ITier.Tier startTier_, enum ITier.Tier endTier_, bytes)` (internal)

Transfers balances of erc20 from/to the tiered account according to the difference in values.
Any failure to transfer in/out will rollback the tier change.
The tiered account must ensure sufficient approvals before attempting to set a new tier.
The `msg.sender` is responsible for paying the token cost of a tier increase.
The tiered account is always the recipient of a refund on a tier decrease.





