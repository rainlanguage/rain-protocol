## `Prestige`






### `statusReport(address account) → uint256` (public)

Implements IPrestige.

Either fetch the report from storage or return UNINITIALIZED.



### `setStatus(address account, enum IPrestige.Status newStatus, bytes data)` (external)

Implements IPrestige.

Errors if the user attempts to return to the NIL status.
Updates the status report from `statusReport` using default `PrestigeUtil` logic.
Calls `_afterSetStatus` that inheriting contracts SHOULD override to enforce status requirements.
Emits `StatusChange` event.



### `_afterSetStatus(address account, enum IPrestige.Status oldStatus, enum IPrestige.Status newStatus, bytes data)` (internal)

Inheriting contracts SHOULD override this to enforce status requirements.

All the internal accounting and state changes are complete at this point.
Use `require` to enforce additional requirements for status changes.






