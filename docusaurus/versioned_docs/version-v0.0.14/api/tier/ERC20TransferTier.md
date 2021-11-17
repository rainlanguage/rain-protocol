`ERC20TransferTier` inherits from `ReadWriteTier`.

In addition to the standard accounting it requires that users transfer
erc20 tokens to achieve a tier.

Data is ignored, the only requirement is that the user has approved
sufficient balance to gain the next tier.

To avoid griefing attacks where accounts remove tiers from arbitrary third
parties, we `require(msg.sender == account_);` when a tier is removed.
When a tier is added the `msg.sender` is responsible for payment.

The 8 values for gainable tiers and erc20 contract must be set upon
construction and are immutable.

The `_afterSetTier` simply transfers the diff between the start/end tier
to/from the user as required.

If a user sends erc20 tokens directly to the contract without calling
`setTier` the FUNDS ARE LOST.



## Details
The `ERC20TransferTier` takes ownership of an erc20 balance by
transferring erc20 token to itself. The `msg.sender` must pay the
difference on upgrade; the tiered address receives refunds on downgrade.
This allows users to "gift" tiers to each other.
As the transfer is a state changing event we can track historical block
times.
As the tiered address moves up/down tiers it sends/receives the value
difference between its current tier only.

The user is required to preapprove enough erc20 to cover the tier change or
they will fail and lose gas.

`ERC20TransferTier` is useful for:
- Claims that rely on historical holdings so the tiered address
  cannot simply "flash claim"
- Token demand and lockup where liquidity (trading) is a secondary goal
- erc20 tokens without additonal restrictions on transfer

## Variables
### `contract IERC20` `erc20`




## Functions
### `constructor(contract IERC20 erc20_, uint256[8] tierValues_)` (public)





### `_afterSetTier(address account_, enum ITier.Tier startTier_, enum ITier.Tier endTier_, bytes)` (internal)

Transfers balances of erc20 from/to the tiered account according to the
difference in values. Any failure to transfer in/out will rollback the
tier change. The tiered account must ensure sufficient approvals before
attempting to set a new tier.
The `msg.sender` is responsible for paying the token cost of a tier
increase.
The tiered account is always the recipient of a refund on a tier
decrease.




