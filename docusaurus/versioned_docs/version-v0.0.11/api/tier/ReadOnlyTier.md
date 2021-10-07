`ReadOnlyTier` is a base contract that other contracts
are expected to inherit.

It does not allow `setStatus` and expects `report` to derive from
some existing onchain data.



## Details
A contract inheriting `ReadOnlyTier` cannot call `setTier`.

`ReadOnlyTier` is abstract because it does not implement `report`.
The expectation is that `report` will derive tiers from some
external data source.




## Functions
### `setTier(address, enum ITier.Tier, bytes)` (external)

Always reverts because it is not possible to set a read only tier.


Updates the tier of an account.

The implementing contract is responsible for all checks and state
changes required to set the tier. For example, taking/refunding
funds/NFTs etc.

Contracts may disallow directly setting tiers, preferring to derive
reports from other onchain data.
In this case they should `revert("SET_TIER");`.



