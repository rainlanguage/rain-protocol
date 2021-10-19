`Phased` is an abstract contract that defines up to `9` phases that
an implementing contract moves through.

`Phase.ZERO` is always the first phase and does not, and cannot, be set
expicitly. Effectively it is implied that `Phase.ZERO` has been active
since block zero.

Each subsequent phase `Phase.ONE` through `Phase.EIGHT` must be
scheduled sequentially and explicitly at a block number.

Only the immediate next phase can be scheduled with `scheduleNextPhase`,
it is not possible to schedule multiple phases ahead.

Multiple phases can be scheduled in a single block if each scheduled phase
is scheduled for the current block.

Several utility functions and modifiers are provided.

A single hook `_beforeScheduleNextPhase` is provided so contracts can
implement additional phase shift checks.

One event `PhaseShiftScheduled` is emitted each time a phase shift is
scheduled (not when the scheduled phase is reached).



## Details
`Phased` contracts have a defined timeline with available
functionality grouped into phases.
Every `Phased` contract starts at `Phase.ZERO` and moves sequentially
through phases `ONE` to `EIGHT`.
Every `Phase` other than `Phase.ZERO` is optional, there is no requirement
that all 9 phases are implemented.
Phases can never be revisited, the inheriting contract always moves through
each achieved phase linearly.
This is enforced by only allowing `scheduleNextPhase` to be called once per
phase.
It is possible to call `scheduleNextPhase` several times in a single block
but the `block.number` for each phase must be reached each time to schedule
the next phase.
Importantly there are events and several modifiers and checks available to
ensure that functionality is limited to the current phase.
The full history of each phase shift block is recorded as a fixed size
array of `uint32`.

## Variables
### `uint32` `UNINITIALIZED`

### `uint32[8]` `phaseBlocks`


## Events
### `PhaseShiftScheduled(uint32 newPhaseBlock_)`

`PhaseShiftScheduled` is emitted when the next phase is scheduled.




## Modifiers
### `onlyPhase(enum Phase phase_)`

Modifies functions to only be callable in a specific phase.




### `onlyAtLeastPhase(enum Phase phase_)`

Modifies functions to only be callable in a specific phase OR if the
specified phase has passed.





## Functions
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
This is called before the phase change so that all functionality that
is behind a phase gate is still available at the moment of applying the
hook for scheduling the next phase.




