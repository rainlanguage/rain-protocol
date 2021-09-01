## `ValueTier`






### `constructor(uint256[8] tierValues_)` (public)

Set the `tierValues` on construction to be referenced immutably.



### `tierValues() → uint256[8] tierValues_` (public)

Complements the default solidity accessor for `tierValues`.
Returns all the values in a list rather than requiring an index be specified.




### `tierToValue(enum ITier.Tier tier_) → uint256` (internal)

Converts a Tier to the minimum value it requires.
Tier ZERO is always value 0 as it is the fallback.



### `valueToTier(uint256 value_) → enum ITier.Tier` (internal)

Converts a value to the maximum Tier it qualifies for.




