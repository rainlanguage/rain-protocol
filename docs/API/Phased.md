## `Phased`





### `onlyPhase(enum Phase phase_)`

Modifies functions to only be callable in a specific phase.
This is usually what you want as phases should typically be isolated in
their functionality.




### `onlyAtLeastPhase(enum Phase phase_)`

Modifies functions to only be callable in a specific phase OR if the
specified phase has passed.
It may be desirable to "unlock" some functionality indefinitely
starting from some phase.





### `phaseAtBlockNumber(uint32[8] phaseBlocks_, uint32 blockNumber_) → enum Phase` (public)

Pure function to reduce an array of phase blocks and block number to a
specific `Phase`.
The phase will be the highest attained even if several phases have the
same block number.
If every phase block is after the block number then `Phase.ZERO` is
returned.
If every phase block is before the block number then `Phase.EIGHT` is
returned.




### `blockNumberForPhase(uint32[8] phaseBlocks_, enum Phase phase_) → uint32` (external)

Pure function to reduce an array of phase blocks and phase to a
specific block number.
`Phase.ZERO` will always return block `0`.
Every other phase will map to a block number in `phaseBlocks_`.




### `currentPhase() → enum Phase` (public)

Impure read-only function to return the "current" phase from internal
contract state.
Simply wraps `phaseAtBlockNumber` for current values of `phaseBlocks`
and `block.number`.



### `scheduleNextPhase(uint32 nextPhaseBlock_)` (internal)

Writes the block for the next phase.
Only uninitialized blocks can be written to.
Only the immediate next phase relative to `currentPhase` can be written
to.
Emits `PhaseShiftScheduled` with the next phase block.




### `_beforeScheduleNextPhase(uint32 nextPhaseBlock_)` (internal)

Hook called before scheduling the next phase.
Useful to apply additional constraints or state changes on a phase
change.
Note this is called when scheduling the phase change, not on the block
the phase change occurs.
Works as Open Zeppelin hooks.





### `PhaseShiftScheduled(uint32 newPhaseBlock_)`

`PhaseShiftScheduled` is emitted when the next phase is scheduled.



