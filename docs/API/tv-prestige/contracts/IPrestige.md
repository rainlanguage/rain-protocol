## `IPrestige`






### `setStatus(address account, enum IPrestige.Status newStatus, bytes data)` (external)

Updates the level of an account by an entered level.
The implementing contract is responsible for taking any actions required to set the status.
For example, taking/refunding funds/NFTs etc.





### `statusReport(address account) → uint256` (external)

Returns the earliest block the account has held each status for continuously.
This is encoded as a uint256 with blocks represented as 8x concatenated u32.
I.e. Each 4 bytes of the uint256 represents a u32 status start time.
The low bits represent low status and high bits the high status.
Implementing contracts should return 0xFFFFFFFF for lost & never-held statuses.






### `StatusChange(address account, enum IPrestige.Status[2] change)`

Every time a status changes we log before and after as a Status[2] against the account.




