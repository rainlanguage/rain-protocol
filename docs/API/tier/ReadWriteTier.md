## `ReadWriteTier`






### `report(address account_) → uint256` (public)

Either fetch the report from storage or return UNINITIALIZED.




### `setTier(address account_, enum ITier.Tier endTier_, bytes data_)` (external)

Errors if the user attempts to return to the ZERO tier.
Updates the report from `report` using default `TierUtil` logic.
Calls `_afterSetTier` that inheriting contracts SHOULD override to enforce status requirements.
Emits `TierChange` event.




### `_afterSetTier(address account_, enum ITier.Tier startTier_, enum ITier.Tier endTier_, bytes data_)` (internal)

Inheriting contracts SHOULD override this to enforce requirements.

All the internal accounting and state changes are complete at this point.
Use `require` to enforce additional requirements for tier changes.






