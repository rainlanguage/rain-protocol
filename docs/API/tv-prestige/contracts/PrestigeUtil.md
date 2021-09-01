## `PrestigeUtil`






### `statusAtFromReport(uint256 report, uint256 blockNumber) → enum IPrestige.Status` (internal)

Returns the highest status achieved relative to a block number and status report.

Note that typically the statusReport will be from the _current_ contract state.
When the `statusReport` comes from a later block than the `blockNumber` this means
the user must have held the status continuously from `blockNumber` _through_ to the report block.
I.e. NOT a snapshot.




### `statusBlock(uint256 report, uint256 statusInt) → uint256` (internal)

Returns the block that a given status has been held since according to a status report.

The status report SHOULD encode "never" as 0xFFFFFFFF




### `truncateStatusesAbove(uint256 report, uint256 statusInt) → uint256` (internal)

Resets all the statuses above the reference status.





### `updateBlocksForStatusRange(uint256 report, uint256 startStatusInt, uint256 endStatusInt, uint256 blockNumber) → uint256` (internal)

Updates a report with a block number for every status integer in a range.

Does nothing if the end status is equal or less than the start status.




### `updateReportWithStatusAtBlock(uint256 report, uint256 currentStatusInt, uint256 newStatusInt, uint256 blockNumber) → uint256` (internal)

Updates a report to a new status.

Internally dispatches to `truncateStatusesAbove` and `updateBlocksForStatuRange`.
The dispatch is based on whether the new status is above or below the current status.
The `currentStatusInt` MUST match the result of `statusAtFromReport`.
It is expected the caller will know the current status when calling this function
and need to do other things in the calling scope with it.





