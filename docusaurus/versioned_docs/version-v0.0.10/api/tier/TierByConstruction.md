`TierByConstruction` is a base contract for other
contracts to inherit from.

It exposes `isTier` and the corresponding modifier `onlyTier`.

This ensures that the address has held at least the given tier
since the contract was constructed.

We check against the construction time of the contract rather
than the current block to avoid various exploits.

Users should not be able to gain a tier for a single block, claim
benefits then remove the tier within the same block.

The construction block provides a simple and generic reference
point that is difficult to manipulate/predict.

Note that `ReadOnlyTier` contracts must carefully consider use
with `TierByConstruction` as they tend to return `0x00000000` for
any/all tiers held. There needs to be additional safeguards to
mitigate "flash tier" attacks.

Note that an account COULD be `TierByConstruction` then lower/
remove a tier, then no longer be eligible when they regain the
tier. Only _continuously held_ tiers are valid against the
construction block check as this is native behaviour of the
`report` function in `ITier`.

Technically the `ITier` could re-enter the `TierByConstruction`
so the `onlyTier` modifier runs AFTER the modified function.



## Details
Enforces tiers held by contract contruction block.
The construction block is compared against the blocks returned by `report`.
The `ITier` contract is paramaterised and set during construction.

## Variables
### `contract ITier` `tierContract`

### `uint256` `constructionBlock`



## Modifiers
### `onlyTier(address account_, enum ITier.Tier minimumTier_)`

https://consensys.github.io/smart-contract-best-practices/recommendations/#use-modifiers-only-for-checks

Do NOT use this to guard setting the tier on an `ITier` contract.
The initial tier would be checked AFTER it has already been
modified which is unsafe.






## Functions
### `constructor(contract ITier tierContract_)` (public)





### `isTier(address account_, enum ITier.Tier minimumTier_) → bool` (public)

Check if an account has held AT LEAST the given tier according to
`tierContract` since construction.
The account MUST have held the tier continuously from construction
until the "current" state according to `report`.
Note that `report` PROBABLY is current as at the block this function is
called but MAYBE NOT.
The `ITier` contract is free to manage reports however makes sense.





