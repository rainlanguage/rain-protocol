## `TierByConstruction`

Enforces tiers held by contract contruction block.
The construction block is compared against the blocks returned by `report`.
The `ITier` contract is paramaterised and set during construction.



### `onlyTier(address account_, enum ITier.Tier minimumTier_)`

Modifier that restricts access to functions depending on the tier required by the function.

`isTier` involves an external call to tierContract.report.
`require` happens AFTER the modified function to avoid rentrant `ITier` code.
Also `report` from `ITier` is `view` so the compiler will error on attempted state modification.
https://consensys.github.io/smart-contract-best-practices/recommendations/#use-modifiers-only-for-checks

Do NOT use this to guard setting the tier on an ITier contract.
The initial tier would be checked AFTER it has already been modified which is unsafe.






### `constructor(contract ITier tierContract_)` (public)





### `isTier(address account_, enum ITier.Tier minimumTier_) → bool` (public)

Check if an account has held AT LEAST the given tier according to `tierContract` since construction.
The account MUST have held the tier continuously from construction until the "current" state according to `report`.
Note that `report` PROBABLY is current as at the block this function is called but MAYBE NOT.
The `ITier` contract is free to manage reports however makes sense to it.






