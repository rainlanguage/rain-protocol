## `PhasedTest`






### `testScheduleNextPhase(uint32 nextPhaseBlock_)` (external)

Exposes `scheduleNextPhase` for testing.




### `runsOnlyPhase(enum Phase phase_) → bool` (external)

This function wraps `onlyPhase` modifier, passing phase directly into
modifier argument.




### `runsOnlyAtLeastPhase(enum Phase phase_) → bool` (external)

This function wraps `onlyAtLeastPhase` modifier, passing phase directly
into modifier argument.




### `toggleHookCondition()` (external)

Toggles `hookCondition` for testing phase scheduling hook.



### `_beforeScheduleNextPhase(uint32 nextPhaseBlock_)` (internal)

Hook called before scheduling the next phase.
Useful to apply additional constraints or state changes on a phase
change.
Note this is called when scheduling the phase change, not on the block
the phase change occurs.
Works as Open Zeppelin hooks.





